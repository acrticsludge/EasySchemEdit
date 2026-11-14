import { json, errorJson, parseCookies, isSecureRequest } from '../src/server/http.ts';
import { getDb } from '../src/server/db.ts';
import worker from '../src/worker.ts';
import type { Env } from '../src/server/env.ts';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

console.log('Running Slice 1 Cloud Router & Server Utility tests...');

// 1. Test http.json
{
  const res = json({ success: true, count: 42 }, 201, { 'X-Custom': '1' });
  assert(res.status === 201, 'json() should set status 201');
  assert(res.headers.get('Content-Type')?.includes('application/json') === true, 'json() should set application/json');
  assert(res.headers.get('X-Custom') === '1', 'json() should preserve custom headers');
  const body = JSON.parse(await res.text());
  assert(body.success === true && body.count === 42, 'json() should serialize data correctly');
}

// 2. Test http.errorJson
{
  const errRes = errorJson('Invalid input', 422);
  assert(errRes.status === 422, 'errorJson() should set status 422');
  const body = JSON.parse(await errRes.text());
  assert(body.error === 'Invalid input', 'errorJson() should format error field');
}

// 3. Test parseCookies
{
  const reqNoCookies = new Request('http://localhost:3000/');
  assert(Object.keys(parseCookies(reqNoCookies)).length === 0, 'parseCookies should handle empty cookies');

  const reqWithCookies = new Request('http://localhost:3000/', {
    headers: {
      Cookie: 'ese_session=token123; theme=dark; encoded=hello%20world',
    },
  });
  const cookies = parseCookies(reqWithCookies);
  assert(cookies.ese_session === 'token123', 'parseCookies should parse ese_session');
  assert(cookies.theme === 'dark', 'parseCookies should parse theme');
  assert(cookies.encoded === 'hello world', 'parseCookies should decode cookie values');
}

// 4. Test isSecureRequest
{
  assert(isSecureRequest(new Request('http://localhost:3000/')) === false, 'http://localhost should be insecure');
  assert(isSecureRequest(new Request('http://127.0.0.1:43127/test')) === false, 'http://127.0.0.1 should be insecure');
  assert(isSecureRequest(new Request('https://localhost:3000/')) === true, 'https://localhost should be secure');
  assert(isSecureRequest(new Request('https://easyschemedit.pages.dev/api/me')) === true, 'https production should be secure');
}

// 5. Test db.getDb
{
  let threw = false;
  try {
    getDb({} as Env);
  } catch (err: any) {
    threw = true;
    assert(err.message.includes('Missing NEON_DATABASE_URL'), 'getDb should error when URL is missing');
  }
  assert(threw, 'getDb should throw without URL');

  const sqlClient = getDb({
    NEON_DATABASE_URL: 'postgres://user:pass@ep-test.neon.tech/neondb',
  } as Env);
  assert(typeof sqlClient === 'function', 'getDb should return a SQL client function');
}

// 6. Test worker fetch dispatcher
{
  const mockAssets = {
    fetch: async (req: Request) => {
      const url = new URL(req.url);
      if (url.pathname === '/asset.png') {
        return new Response('png-data', { status: 200 });
      }
      if (url.pathname === '/editor/index.html') {
        return new Response('editor-html', { status: 200 });
      }
      return new Response('Not Found', { status: 404 });
    },
  };

  const mockEnv: Env = {
    ASSETS: mockAssets as any,
    PROJECTS_BUCKET: {} as any,
    NEON_DATABASE_URL: 'postgres://user:pass@ep-test.neon.tech/neondb',
    SESSION_SECRET: 'test-secret',
  };

  // 6a. / -> redirect /editor (302)
  const rootRes = await worker.fetch(new Request('http://localhost/'), mockEnv, {} as any);
  assert(rootRes.status === 302, 'Root / should return 302 redirect');
  assert(rootRes.headers.get('Location') === 'http://localhost/editor', 'Redirect should point to /editor');

  // 6b. /api/unknown -> 404
  const api404Res = await worker.fetch(new Request('http://localhost/api/nonexistent'), mockEnv, {} as any);
  assert(api404Res.status === 404, '/api/* should return 404 for unknown endpoints');
  const api404Body = JSON.parse(await api404Res.text());
  assert(api404Body.error === 'Not found', '404 should return error: Not found');

  // 6c. Static asset hit
  const assetRes = await worker.fetch(new Request('http://localhost/asset.png'), mockEnv, {} as any);
  assert(assetRes.status === 200, 'Static asset should return 200');

  // 6d. Fallback to /editor/index.html
  const fallbackRes = await worker.fetch(new Request('http://localhost/some-route'), mockEnv, {} as any);
  assert(fallbackRes.status === 200, 'Non-existent route should fall back to editor/index.html');
  const text = await fallbackRes.text();
  assert(text === 'editor-html', 'Fallback should serve editor/index.html');
}

// 7. Test Auth & Projects route dispatching and HTTP method guards
{
  const mockEnv: Env = {
    ASSETS: { fetch: async () => new Response('Not Found', { status: 404 }) } as any,
    PROJECTS_BUCKET: {} as any,
    NEON_DATABASE_URL: 'postgres://user:pass@ep-test.neon.tech/neondb',
    SESSION_SECRET: 'test-secret',
  };

  // 7a. Method Not Allowed (405) checks on matched endpoints
  const methodGuards = [
    { url: 'http://localhost/api/auth/register', method: 'GET' },
    { url: 'http://localhost/api/auth/login', method: 'GET' },
    { url: 'http://localhost/api/auth/logout', method: 'GET' },
    { url: 'http://localhost/api/auth/me', method: 'POST' },
    { url: 'http://localhost/api/projects', method: 'PUT' },
    { url: 'http://localhost/api/projects', method: 'DELETE' },
    { url: 'http://localhost/api/projects/proj-abc/archive', method: 'POST' },
    { url: 'http://localhost/api/projects/proj-abc/archive', method: 'DELETE' },
    { url: 'http://localhost/api/projects/proj-abc', method: 'POST' },
    { url: 'http://localhost/api/projects/proj-abc', method: 'PUT' },
    { url: 'http://localhost/api/workspace', method: 'POST' },
    { url: 'http://localhost/api/workspace', method: 'DELETE' },
    { url: 'http://localhost/api/projects/proj-abc/schematics', method: 'GET' },
    { url: 'http://localhost/api/projects/proj-abc/schematics', method: 'PUT' },
    { url: 'http://localhost/api/projects/proj-abc/schematics', method: 'DELETE' },
    { url: 'http://localhost/api/schematics/schem-abc/archive', method: 'POST' },
    { url: 'http://localhost/api/schematics/schem-abc/archive', method: 'DELETE' },
    { url: 'http://localhost/api/schematics/schem-abc', method: 'POST' },
    { url: 'http://localhost/api/schematics/schem-abc', method: 'PUT' },
  ];

  for (const { url, method } of methodGuards) {
    const res = await worker.fetch(new Request(url, { method }), mockEnv, {} as any);
    assert(res.status === 405, `${method} ${url} should return 405 Method Not Allowed (got ${res.status})`);
    const body = (await res.json()) as any;
    assert(body.error === 'Method Not Allowed', `Expected 'Method Not Allowed' error message`);
  }

  // 7b. Auth validation routing: POST /api/auth/register with empty body -> 400
  const regBadRes = await worker.fetch(
    new Request('http://localhost/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }),
    mockEnv,
    {} as any
  );
  assert(regBadRes.status === 400, 'POST /api/auth/register without body should return 400');

  // 7c. Auth validation routing: POST /api/auth/login with empty body -> 400
  const loginBadRes = await worker.fetch(
    new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }),
    mockEnv,
    {} as any
  );
  assert(loginBadRes.status === 400, 'POST /api/auth/login without body should return 400');

  // 7d. Auth me unauthenticated -> 401
  const meRes = await worker.fetch(
    new Request('http://localhost/api/auth/me', { method: 'GET' }),
    mockEnv,
    {} as any
  );
  assert(meRes.status === 401, 'GET /api/auth/me without session should return 401');

  // 7e. Projects unauthenticated requests -> 401
  const projListRes = await worker.fetch(
    new Request('http://localhost/api/projects', { method: 'GET' }),
    mockEnv,
    {} as any
  );
  assert(projListRes.status === 401, 'GET /api/projects without session should return 401');

  const projCreateRes = await worker.fetch(
    new Request('http://localhost/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test' }),
    }),
    mockEnv,
    {} as any
  );
  assert(projCreateRes.status === 401, 'POST /api/projects without session should return 401');

  const projGetRes = await worker.fetch(
    new Request('http://localhost/api/projects/proj-123', { method: 'GET' }),
    mockEnv,
    {} as any
  );
  assert(projGetRes.status === 401, 'GET /api/projects/:id without session should return 401');

  const projPatchRes = await worker.fetch(
    new Request('http://localhost/api/projects/proj-123', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'New Name' }),
    }),
    mockEnv,
    {} as any
  );
  assert(projPatchRes.status === 401, 'PATCH /api/projects/:id without session should return 401');

  const projDeleteRes = await worker.fetch(
    new Request('http://localhost/api/projects/proj-123', { method: 'DELETE' }),
    mockEnv,
    {} as any
  );
  assert(projDeleteRes.status === 401, 'DELETE /api/projects/:id without session should return 401');

  const projArchiveGetRes = await worker.fetch(
    new Request('http://localhost/api/projects/proj-123/archive', { method: 'GET' }),
    mockEnv,
    {} as any
  );
  assert(projArchiveGetRes.status === 401, 'GET /api/projects/:id/archive without session should return 401');

  const projArchivePutRes = await worker.fetch(
    new Request('http://localhost/api/projects/proj-123/archive', { method: 'PUT' }),
    mockEnv,
    {} as any
  );
  assert(projArchivePutRes.status === 401, 'PUT /api/projects/:id/archive without session should return 401');

  // Workspace unauthenticated -> 401
  const wsRes = await worker.fetch(
    new Request('http://localhost/api/workspace', { method: 'GET' }),
    mockEnv,
    {} as any
  );
  assert(wsRes.status === 401, 'GET /api/workspace without session should return 401');

  // Schematic unauthenticated requests -> 401
  const schemCreateRes = await worker.fetch(
    new Request('http://localhost/api/projects/proj-123/schematics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Schem' }),
    }),
    mockEnv,
    {} as any
  );
  assert(schemCreateRes.status === 401, 'POST /api/projects/:projectId/schematics without session should return 401');

  const schemGetRes = await worker.fetch(
    new Request('http://localhost/api/schematics/schem-123', { method: 'GET' }),
    mockEnv,
    {} as any
  );
  assert(schemGetRes.status === 401, 'GET /api/schematics/:id without session should return 401');

  const schemPatchRes = await worker.fetch(
    new Request('http://localhost/api/schematics/schem-123', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'New Name' }),
    }),
    mockEnv,
    {} as any
  );
  assert(schemPatchRes.status === 401, 'PATCH /api/schematics/:id without session should return 401');

  const schemDeleteRes = await worker.fetch(
    new Request('http://localhost/api/schematics/schem-123', { method: 'DELETE' }),
    mockEnv,
    {} as any
  );
  assert(schemDeleteRes.status === 401, 'DELETE /api/schematics/:id without session should return 401');

  const schemArchiveGetRes = await worker.fetch(
    new Request('http://localhost/api/schematics/schem-123/archive', { method: 'GET' }),
    mockEnv,
    {} as any
  );
  assert(schemArchiveGetRes.status === 401, 'GET /api/schematics/:id/archive without session should return 401');

  const schemArchivePutRes = await worker.fetch(
    new Request('http://localhost/api/schematics/schem-123/archive', { method: 'PUT' }),
    mockEnv,
    {} as any
  );
  assert(schemArchivePutRes.status === 401, 'PUT /api/schematics/:id/archive without session should return 401');

  // 7f. Multi-segment unmatched paths -> 404
  const deepRes = await worker.fetch(
    new Request('http://localhost/api/projects/proj-123/archive/extra', { method: 'GET' }),
    mockEnv,
    {} as any
  );
  assert(deepRes.status === 404, 'Nested /api/projects/:id/archive/extra should return 404');
}

console.log('✓ All Slice 1 tests passed successfully!');
