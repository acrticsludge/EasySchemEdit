import {
  handleListProjects,
  handleCreateProject,
  handleGetProject,
  handleGetProjectArchive,
  handleSaveProjectArchive,
  handleRenameProject,
  handleDeleteProject,
  formatProjectSummary,
  MAX_ARCHIVE_BYTES,
} from '../src/server/projects.ts';
import { sha256Hex } from '../src/server/crypto.ts';
import type { Env } from '../src/server/env.ts';
import type { SqlClient } from '../src/server/db.ts';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

console.log('Running Slice 3 Projects API and R2 Archive tests...');

// In-memory mock database state
interface MockProjectRow {
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

interface MockSessionRow {
  id: string;
  user_id: string;
  username: string;
  token_hash: string;
  expires_at: Date;
}

class MockDb {
  sessions: MockSessionRow[] = [];
  projects: MockProjectRow[] = [];

  createSqlClient(): SqlClient {
    const self = this;
    const client = (async (strings: TemplateStringsArray, ...values: any[]) => {
      // Reconstruct query text
      let query = '';
      for (let i = 0; i < strings.length; i++) {
        query += strings[i];
        if (i < values.length) {
          query += `$${i + 1}`;
        }
      }

      const q = query.trim();

      // 1. Session lookup for requireSession
      if (q.includes('FROM sessions s') && q.includes('token_hash = $1')) {
        const tokenHash = values[0];
        const now = new Date();
        const found = self.sessions.find(
          (s) => s.token_hash === tokenHash && s.expires_at > now
        );
        if (!found) return [];
        return [
          {
            session_id: found.id,
            user_id: found.user_id,
            username: found.username,
          },
        ];
      }

      // 2. List projects: SELECT ... FROM projects WHERE user_id = $1 ORDER BY updated_at DESC
      if (q.startsWith('SELECT') && q.includes('FROM projects') && q.includes('WHERE user_id = $1')) {
        const userId = values[0];
        const userProjects = self.projects
          .filter((p) => p.user_id === userId)
          .sort((a, b) => b.updated_at.getTime() - a.updated_at.getTime());
        return userProjects.map((p) => ({ ...p }));
      }

      // 3. Single project lookup: SELECT ... FROM projects WHERE id = $1 AND user_id = $2
      if (q.startsWith('SELECT') && q.includes('FROM projects') && q.includes('WHERE id = $1 AND user_id = $2')) {
        const projectId = values[0];
        const userId = values[1];
        const found = self.projects.find((p) => p.id === projectId && p.user_id === userId);
        if (!found) return [];
        return [{ ...found }];
      }

      // 4. Insert project: INSERT INTO projects ...
      if (q.startsWith('INSERT INTO projects')) {
        const [id, userId, name, revision, placementCount, r2Key, sizeBytes] = values;
        const now = new Date();
        const newRow: MockProjectRow = {
          id,
          user_id: userId,
          name,
          revision: Number(revision),
          placement_count: Number(placementCount),
          r2_key: r2Key,
          size_bytes: Number(sizeBytes),
          created_at: now,
          updated_at: now,
        };
        self.projects.push(newRow);
        return [{ ...newRow }];
      }

      // 5. Update project: UPDATE projects SET ... WHERE id = $5 AND user_id = $6 (or by name/revision/count/size)
      if (q.startsWith('UPDATE projects')) {
        if (q.includes('SET') && q.includes('name = $1') && q.includes('revision = $2')) {
          // Archive update
          const [name, revision, placementCount, sizeBytes, projectId, userId] = values;
          const found = self.projects.find((p) => p.id === projectId && p.user_id === userId);
          if (!found) return [];
          found.name = name;
          found.revision = Number(revision);
          found.placement_count = Number(placementCount);
          found.size_bytes = Number(sizeBytes);
          found.updated_at = new Date();
          return [{ ...found }];
        } else if (q.includes('SET') && q.includes('name = $1') && q.includes('updated_at = now()')) {
          // Rename update
          const [name, projectId, userId] = values;
          const found = self.projects.find((p) => p.id === projectId && p.user_id === userId);
          if (!found) return [];
          found.name = name;
          found.updated_at = new Date();
          return [{ ...found }];
        }
      }

      // 6. Delete project: DELETE FROM projects WHERE id = $1 AND user_id = $2 RETURNING r2_key
      if (q.startsWith('DELETE FROM projects')) {
        const projectId = values[0];
        const userId = values[1];
        const idx = self.projects.findIndex((p) => p.id === projectId && p.user_id === userId);
        if (idx === -1) return [];
        const [deleted] = self.projects.splice(idx, 1);
        return [{ r2_key: deleted.r2_key }];
      }

      throw new Error(`Unhandled mock SQL query: ${query}`);
    }) as unknown as SqlClient;

    return client;
  }
}

// In-memory mock R2 Bucket
class MockR2Bucket {
  objects = new Map<string, { body: Uint8Array; metadata?: any }>();

  async get(key: string) {
    const item = this.objects.get(key);
    if (!item) return null;
    return {
      body: item.body,
    };
  }

  async put(key: string, value: ArrayBuffer | Uint8Array, options?: any) {
    const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
    this.objects.set(key, { body: bytes, metadata: options?.httpMetadata });
    return { key, size: bytes.byteLength };
  }

  async delete(key: string) {
    this.objects.delete(key);
  }
}

// Helper to construct test requests with session cookie
function makeRequest(
  url: string,
  method = 'GET',
  token?: string,
  body?: BodyInit | null,
  headers?: Record<string, string>
): Request {
  const h = new Headers(headers);
  if (token) {
    h.set('Cookie', `ese_session=${token}`);
  }
  return new Request(url, {
    method,
    headers: h,
    body: body ?? undefined,
  });
}

// Setup test environment
const mockDb = new MockDb();
const mockR2 = new MockR2Bucket();
const sql = mockDb.createSqlClient();

const env: Env = {
  ASSETS: {} as any,
  PROJECTS_BUCKET: mockR2 as any,
  NEON_DATABASE_URL: 'postgres://dummy:dummy@localhost/easyschemedit',
  SESSION_SECRET: 'test-secret',
};

// Seed Alice and Bob sessions
const ALICE_TOKEN = 'alice-session-token-12345';
const BOB_TOKEN = 'bob-session-token-67890';

mockDb.sessions.push(
  {
    id: 'sess-alice',
    user_id: 'usr-alice',
    username: 'alice',
    token_hash: await sha256Hex(ALICE_TOKEN),
    expires_at: new Date(Date.now() + 86400000), // +1 day
  },
  {
    id: 'sess-bob',
    user_id: 'usr-bob',
    username: 'bob',
    token_hash: await sha256Hex(BOB_TOKEN),
    expires_at: new Date(Date.now() + 86400000), // +1 day
  }
);

// --- TEST SUITE ---

// 1. Unauthenticated requests return 401 Unauthorized
{
  const listRes = await handleListProjects(makeRequest('http://localhost/api/projects'), env, sql);
  assert(listRes.status === 401, 'handleListProjects should return 401 without session');
  const errBody = (await listRes.json()) as any;
  assert(errBody.error === 'Unauthorized', 'Error message should be Unauthorized');

  const createRes = await handleCreateProject(
    makeRequest('http://localhost/api/projects', 'POST', undefined, JSON.stringify({ name: 'A' }), {
      'Content-Type': 'application/json',
    }),
    env,
    sql
  );
  assert(createRes.status === 401, 'handleCreateProject should return 401 without session');

  const getRes = await handleGetProject(makeRequest('http://localhost/api/projects/p1'), env, 'p1', sql);
  assert(getRes.status === 401, 'handleGetProject should return 401 without session');

  const getArchiveRes = await handleGetProjectArchive(
    makeRequest('http://localhost/api/projects/p1/archive'),
    env,
    'p1',
    sql
  );
  assert(getArchiveRes.status === 401, 'handleGetProjectArchive should return 401 without session');

  const saveArchiveRes = await handleSaveProjectArchive(
    makeRequest('http://localhost/api/projects/p1/archive', 'PUT', undefined, new Uint8Array([1, 2, 3])),
    env,
    'p1',
    sql
  );
  assert(saveArchiveRes.status === 401, 'handleSaveProjectArchive should return 401 without session');

  const renameRes = await handleRenameProject(
    makeRequest('http://localhost/api/projects/p1', 'PATCH', undefined, JSON.stringify({ name: 'New' }), {
      'Content-Type': 'application/json',
    }),
    env,
    'p1',
    sql
  );
  assert(renameRes.status === 401, 'handleRenameProject should return 401 without session');

  const deleteRes = await handleDeleteProject(
    makeRequest('http://localhost/api/projects/p1', 'DELETE'),
    env,
    'p1',
    sql
  );
  assert(deleteRes.status === 401, 'handleDeleteProject should return 401 without session');
}

// 2. handleCreateProject: JSON creation
let aliceProjectId1 = '';
{
  const res = await handleCreateProject(
    makeRequest(
      'http://localhost/api/projects',
      'POST',
      ALICE_TOKEN,
      JSON.stringify({ name: 'Alice Castle' }),
      { 'Content-Type': 'application/json' }
    ),
    env,
    sql
  );
  assert(res.status === 201, 'handleCreateProject (JSON) should return 201 Created');
  const data = (await res.json()) as any;
  assert(data.project && typeof data.project.id === 'string', 'Should return created project with id');
  assert(data.project.name === 'Alice Castle', 'Project name should match input');
  assert(data.project.revision === 1, 'Initial revision should be 1');
  assert(data.project.placementCount === 0, 'Initial placement count should be 0');
  assert(data.project.sizeBytes === 0, 'Initial size should be 0');
  aliceProjectId1 = data.project.id;
}

// 3. handleCreateProject: JSON with default name fallback
{
  const res = await handleCreateProject(
    makeRequest(
      'http://localhost/api/projects',
      'POST',
      ALICE_TOKEN,
      JSON.stringify({}),
      { 'Content-Type': 'application/json' }
    ),
    env,
    sql
  );
  assert(res.status === 201, 'handleCreateProject without name should return 201');
  const data = (await res.json()) as any;
  assert(data.project.name === 'Untitled Project', 'Should default to Untitled Project');
}

// 4. handleCreateProject: Binary archive body upload
let aliceProjectId2 = '';
const sampleArchiveBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]); // zip magic header
{
  // 4a. Empty body should return 400
  const emptyRes = await handleCreateProject(
    makeRequest(
      'http://localhost/api/projects',
      'POST',
      ALICE_TOKEN,
      new Uint8Array(0),
      {
        'Content-Type': 'application/zip',
        'X-Project-Name': 'Empty%20Test',
      }
    ),
    env,
    sql
  );
  assert(emptyRes.status === 400, 'Empty binary body should return 400');

  // 4b. Valid binary upload
  const res = await handleCreateProject(
    makeRequest(
      'http://localhost/api/projects',
      'POST',
      ALICE_TOKEN,
      sampleArchiveBytes,
      {
        'Content-Type': 'application/zip',
        'X-Project-Name': 'Clock%20Tower',
        'X-Revision': '3',
        'X-Placement-Count': '12',
      }
    ),
    env,
    sql
  );
  assert(res.status === 201, 'Binary create should return 201');
  const data = (await res.json()) as any;
  assert(data.project.name === 'Clock Tower', 'Should URI-decode X-Project-Name');
  assert(data.project.revision === 3, 'Revision should be 3 from header');
  assert(data.project.placementCount === 12, 'Placement count should be 12 from header');
  assert(data.project.sizeBytes === sampleArchiveBytes.byteLength, 'Size should match uploaded bytes');

  aliceProjectId2 = data.project.id;
  const expectedR2Key = `users/usr-alice/projects/${aliceProjectId2}.vxproj`;
  assert(mockR2.objects.has(expectedR2Key), 'R2 bucket should contain uploaded archive');
}

// 5. handleListProjects: User isolation and sorting
{
  // Create a project for Bob
  const bobRes = await handleCreateProject(
    makeRequest(
      'http://localhost/api/projects',
      'POST',
      BOB_TOKEN,
      JSON.stringify({ name: 'Bob Secret Vault' }),
      { 'Content-Type': 'application/json' }
    ),
    env,
    sql
  );
  assert(bobRes.status === 201, 'Bob project creation should succeed');

  // List Alice projects: should only see Alice's projects (Alice Castle, Untitled Project, Clock Tower)
  const aliceListRes = await handleListProjects(
    makeRequest('http://localhost/api/projects', 'GET', ALICE_TOKEN),
    env,
    sql
  );
  assert(aliceListRes.status === 200, 'handleListProjects should return 200');
  const aliceData = (await aliceListRes.json()) as any;
  assert(Array.isArray(aliceData.projects), 'Response should have projects array');
  assert(aliceData.projects.length === 3, 'Alice should see exactly 3 projects');
  assert(
    !aliceData.projects.some((p: any) => p.name.includes('Bob')),
    'Alice must never see Bob projects'
  );

  // List Bob projects
  const bobListRes = await handleListProjects(
    makeRequest('http://localhost/api/projects', 'GET', BOB_TOKEN),
    env,
    sql
  );
  const bobData = (await bobListRes.json()) as any;
  assert(bobData.projects.length === 1, 'Bob should see exactly 1 project');
  assert(bobData.projects[0].name === 'Bob Secret Vault', 'Bob project name should match');
}

// 6. handleGetProject: Single project lookup & isolation
{
  // Alice fetching her own project
  const res1 = await handleGetProject(
    makeRequest(`http://localhost/api/projects/${aliceProjectId1}`, 'GET', ALICE_TOKEN),
    env,
    aliceProjectId1,
    sql
  );
  assert(res1.status === 200, 'Alice fetching her project should return 200');
  const data1 = (await res1.json()) as any;
  assert(data1.project.id === aliceProjectId1, 'Returned project ID should match');

  // Alice fetching Bob's project -> 404
  const bobProj = mockDb.projects.find((p) => p.user_id === 'usr-bob')!;
  const res2 = await handleGetProject(
    makeRequest(`http://localhost/api/projects/${bobProj.id}`, 'GET', ALICE_TOKEN),
    env,
    bobProj.id,
    sql
  );
  assert(res2.status === 404, 'Querying unowned project must return 404');

  // Non-existent project id -> 404
  const res3 = await handleGetProject(
    makeRequest('http://localhost/api/projects/non-existent-id', 'GET', ALICE_TOKEN),
    env,
    'non-existent-id',
    sql
  );
  assert(res3.status === 404, 'Querying non-existent project must return 404');
}

// 7. handleGetProjectArchive: Archive download & isolation
{
  // Alice downloading her Clock Tower archive
  const res1 = await handleGetProjectArchive(
    makeRequest(`http://localhost/api/projects/${aliceProjectId2}/archive`, 'GET', ALICE_TOKEN),
    env,
    aliceProjectId2,
    sql
  );
  assert(res1.status === 200, 'Archive download should return 200');
  assert(
    res1.headers.get('Content-Type') === 'application/zip',
    'Content-Type should be application/zip'
  );
  assert(
    res1.headers.get('Content-Disposition')?.includes('.vxproj') === true,
    'Content-Disposition should indicate .vxproj'
  );
  const bodyBuf = new Uint8Array(await res1.arrayBuffer());
  assert(
    bodyBuf.length === sampleArchiveBytes.length && bodyBuf[0] === sampleArchiveBytes[0],
    'Downloaded binary content must match uploaded bytes'
  );

  // Bob trying to download Alice's archive -> 404
  const res2 = await handleGetProjectArchive(
    makeRequest(`http://localhost/api/projects/${aliceProjectId2}/archive`, 'GET', BOB_TOKEN),
    env,
    aliceProjectId2,
    sql
  );
  assert(res2.status === 404, 'Bob downloading Alice archive must return 404');

  // Alice trying to download aliceProjectId1 before archive has been uploaded -> 404
  const res3 = await handleGetProjectArchive(
    makeRequest(`http://localhost/api/projects/${aliceProjectId1}/archive`, 'GET', ALICE_TOKEN),
    env,
    aliceProjectId1,
    sql
  );
  assert(res3.status === 404, 'Missing archive in R2 must return 404');
}

// 8. handleSaveProjectArchive: Update archive binary & metadata
{
  const newArchiveBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x99, 0x88, 0x77, 0x66, 0x55]);

  // 8a. Empty body -> 400
  const emptyRes = await handleSaveProjectArchive(
    makeRequest(
      `http://localhost/api/projects/${aliceProjectId2}/archive`,
      'PUT',
      ALICE_TOKEN,
      new Uint8Array(0)
    ),
    env,
    aliceProjectId2,
    sql
  );
  assert(emptyRes.status === 400, 'Saving empty archive should return 400');

  // 8b. Bob attempting to save to Alice's project -> 404
  const unownedRes = await handleSaveProjectArchive(
    makeRequest(
      `http://localhost/api/projects/${aliceProjectId2}/archive`,
      'PUT',
      BOB_TOKEN,
      newArchiveBytes
    ),
    env,
    aliceProjectId2,
    sql
  );
  assert(unownedRes.status === 404, 'Saving to unowned project must return 404');

  // 8c. Alice saving new revision with updated placement count
  const saveRes = await handleSaveProjectArchive(
    makeRequest(
      `http://localhost/api/projects/${aliceProjectId2}/archive`,
      'PUT',
      ALICE_TOKEN,
      newArchiveBytes,
      {
        'Content-Type': 'application/zip',
        'X-Project-Name': 'Grand%20Clock%20Tower',
        'X-Revision': '4',
        'X-Placement-Count': '25',
      }
    ),
    env,
    aliceProjectId2,
    sql
  );
  assert(saveRes.status === 200, 'Saving updated archive should return 200');
  const saveBody = (await saveRes.json()) as any;
  assert(saveBody.project.name === 'Grand Clock Tower', 'Name should be updated');
  assert(saveBody.project.revision === 4, 'Revision should be 4');
  assert(saveBody.project.placementCount === 25, 'Placement count should be 25');
  assert(saveBody.project.sizeBytes === newArchiveBytes.byteLength, 'Size should match new archive');

  // Verify R2 object was updated
  const r2Obj = await mockR2.get(`users/usr-alice/projects/${aliceProjectId2}.vxproj`);
  assert(r2Obj !== null, 'R2 object must exist');
  assert(r2Obj!.body[4] === 0x99, 'R2 object bytes must reflect update');
}

// 9. handleRenameProject: Rename & validation
{
  // 9a. Empty name -> 400
  const badRes = await handleRenameProject(
    makeRequest(
      `http://localhost/api/projects/${aliceProjectId1}`,
      'PATCH',
      ALICE_TOKEN,
      JSON.stringify({ name: '   ' }),
      { 'Content-Type': 'application/json' }
    ),
    env,
    aliceProjectId1,
    sql
  );
  assert(badRes.status === 400, 'Empty rename should return 400');

  // 9b. Bob attempting to rename Alice project -> 404
  const unownedRes = await handleRenameProject(
    makeRequest(
      `http://localhost/api/projects/${aliceProjectId1}`,
      'PATCH',
      BOB_TOKEN,
      JSON.stringify({ name: 'Hacked' }),
      { 'Content-Type': 'application/json' }
    ),
    env,
    aliceProjectId1,
    sql
  );
  assert(unownedRes.status === 404, 'Renaming unowned project must return 404');

  // 9c. Successful rename
  const renameRes = await handleRenameProject(
    makeRequest(
      `http://localhost/api/projects/${aliceProjectId1}`,
      'PATCH',
      ALICE_TOKEN,
      JSON.stringify({ name: 'Alice Obsidian Palace' }),
      { 'Content-Type': 'application/json' }
    ),
    env,
    aliceProjectId1,
    sql
  );
  assert(renameRes.status === 200, 'Valid rename should return 200');
  const renameBody = (await renameRes.json()) as any;
  assert(renameBody.project.name === 'Alice Obsidian Palace', 'Project name should be updated');
}

// 10. handleDeleteProject: Deletion & R2 cleanup
{
  // 10a. Bob trying to delete Alice's project -> 404
  const unownedRes = await handleDeleteProject(
    makeRequest(`http://localhost/api/projects/${aliceProjectId2}`, 'DELETE', BOB_TOKEN),
    env,
    aliceProjectId2,
    sql
  );
  assert(unownedRes.status === 404, 'Deleting unowned project must return 404');
  assert(
    mockR2.objects.has(`users/usr-alice/projects/${aliceProjectId2}.vxproj`),
    'R2 archive must NOT be deleted when unowned'
  );

  // 10b. Alice deleting her Clock Tower project
  const delRes = await handleDeleteProject(
    makeRequest(`http://localhost/api/projects/${aliceProjectId2}`, 'DELETE', ALICE_TOKEN),
    env,
    aliceProjectId2,
    sql
  );
  assert(delRes.status === 200, 'Valid delete should return 200');
  const delBody = (await delRes.json()) as any;
  assert(delBody.ok === true && delBody.id === aliceProjectId2, 'Delete response format should match');

  // Verify deleted from Neon and R2
  assert(
    !mockDb.projects.some((p) => p.id === aliceProjectId2),
    'Project must be deleted from DB'
  );
  assert(
    !mockR2.objects.has(`users/usr-alice/projects/${aliceProjectId2}.vxproj`),
    'R2 archive must be deleted from R2 bucket'
  );
}

// 11. Upload size guard (MAX_ARCHIVE_BYTES = 50MB)
{
  assert(MAX_ARCHIVE_BYTES === 50 * 1024 * 1024, 'MAX_ARCHIVE_BYTES must equal 50MB');

  // Mock a large buffer object with byteLength = 50MB + 1
  const oversizedBuffer = {
    byteLength: 50 * 1024 * 1024 + 1,
  } as ArrayBuffer;

  const oversizedRequest = {
    headers: new Headers({
      Cookie: `ese_session=${ALICE_TOKEN}`,
      'Content-Type': 'application/zip',
    }),
    arrayBuffer: async () => oversizedBuffer,
  } as unknown as Request;

  const res = await handleSaveProjectArchive(oversizedRequest, env, aliceProjectId1, sql);
  assert(res.status === 413, 'Oversized archive (>50MB) must return 413 Payload Too Large');
}

console.log('✓ All Slice 3 Projects API and R2 Archive tests passed successfully!');
