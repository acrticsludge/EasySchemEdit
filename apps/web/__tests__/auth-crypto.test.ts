import {
  constantTimeEqual,
  bytesToBase64,
  base64ToBytes,
  bytesToBase64Url,
  hashPassword,
  verifyPassword,
  generateSessionToken,
  sha256Hex,
} from '../src/server/crypto.ts';

import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  buildSessionCookie,
  buildClearSessionCookie,
  validateUsername,
  validatePassword,
  requireSession,
  handleRegister,
  handleLogin,
  handleLogout,
  handleMe,
} from '../src/server/auth.ts';

import type { Env } from '../src/server/env.ts';
import type { SqlClient } from '../src/server/db.ts';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

console.log('Running Slice 2 Auth Crypto & Handler unit tests...');

// ============================================================================
// 1. Crypto Utilities
// ============================================================================

// 1a. constantTimeEqual
{
  const a = new Uint8Array([1, 2, 3, 4]);
  const b = new Uint8Array([1, 2, 3, 4]);
  const c = new Uint8Array([1, 2, 3, 5]);
  const d = new Uint8Array([1, 2, 3]);
  const empty1 = new Uint8Array([]);
  const empty2 = new Uint8Array([]);

  assert(constantTimeEqual(a, b) === true, 'constantTimeEqual: identical arrays should be equal');
  assert(constantTimeEqual(a, c) === false, 'constantTimeEqual: different elements should be unequal');
  assert(constantTimeEqual(a, d) === false, 'constantTimeEqual: different lengths should be unequal');
  assert(constantTimeEqual(empty1, empty2) === true, 'constantTimeEqual: empty arrays should be equal');
}

// 1b. bytesToBase64 & base64ToBytes
{
  const raw = new Uint8Array([72, 101, 108, 108, 111, 33]); // "Hello!"
  const b64 = bytesToBase64(raw);
  assert(b64 === 'SGVsbG8h', `bytesToBase64: expected SGVsbG8h, got ${b64}`);

  const decoded = base64ToBytes(b64);
  assert(constantTimeEqual(raw, decoded), 'base64ToBytes: roundtrip should match');

  let caughtInvalid = false;
  try {
    base64ToBytes('not!valid!base64');
  } catch {
    caughtInvalid = true;
  }
  assert(caughtInvalid, 'base64ToBytes: should reject invalid base64');
}

// 1c. bytesToBase64Url
{
  const bytes = new Uint8Array([251, 255, 254]); // produces '+//+' in base64
  const b64url = bytesToBase64Url(bytes);
  assert(!b64url.includes('+'), 'bytesToBase64Url: must not contain +');
  assert(!b64url.includes('/'), 'bytesToBase64Url: must not contain /');
  assert(!b64url.includes('='), 'bytesToBase64Url: must not contain padding =');
}

// 1d. sha256Hex
{
  const hashTest = await sha256Hex('test');
  assert(
    hashTest === '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
    'sha256Hex: should match known SHA-256 for "test"'
  );

  const hashEmpty = await sha256Hex('');
  assert(
    hashEmpty === 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    'sha256Hex: should match known SHA-256 for empty string'
  );
}

// 1e. generateSessionToken
{
  const tokens = new Set<string>();
  for (let i = 0; i < 100; i++) {
    const token = generateSessionToken();
    assert(token.length >= 40, 'generateSessionToken: length should be at least 40 chars');
    assert(/^[a-zA-Z0-9_-]+$/.test(token), 'generateSessionToken: must use URL-safe chars only');
    tokens.add(token);
  }
  assert(tokens.size === 100, 'generateSessionToken: 100 tokens must all be unique');
}

// 1f. hashPassword and verifyPassword
{
  const password = 'SuperSecretPassword123!';
  const hash = await hashPassword(password);

  assert(hash.startsWith('pbkdf2_sha256$100000$'), 'hashPassword: format prefix must match');
  const parts = hash.split('$');
  assert(parts.length === 4, 'hashPassword: must contain 4 parts separated by $');
  assert(parts[2].length === 24, 'hashPassword: 16-byte salt base64 should be 24 chars');
  assert(parts[3].length === 44, 'hashPassword: 32-byte hash base64 should be 44 chars');

  // Valid password check
  const valid = await verifyPassword(password, hash);
  assert(valid === true, 'verifyPassword: valid password must verify to true');

  // Wrong password check
  const wrong = await verifyPassword('WrongPassword123!', hash);
  assert(wrong === false, 'verifyPassword: wrong password must verify to false');

  // Empty password check
  const emptyPass = await verifyPassword('', hash);
  assert(emptyPass === false, 'verifyPassword: empty password must verify to false');

  // Unicode password check
  const unicodePass = 'Pässwörd-✓-測試';
  const unicodeHash = await hashPassword(unicodePass);
  assert(await verifyPassword(unicodePass, unicodeHash) === true, 'verifyPassword: unicode password roundtrip');
  assert(await verifyPassword('Password-✓-測試', unicodeHash) === false, 'verifyPassword: unicode wrong password');

  // Malformed stored hash strings
  const malformedHashes = [
    '',
    'not_a_hash',
    'pbkdf2_sha256',
    'pbkdf2_sha256$100000',
    'pbkdf2_sha256$100000$salt',
    'pbkdf2_sha256$100000$salt$hash$extra',
    'bcrypt$100000$c2FsdHNhbHRzYWx0$aGFzaGhhc2hoYXNo',
    'pbkdf2_sha256$NaN$c2FsdHNhbHRzYWx0$aGFzaGhhc2hoYXNo',
    'pbkdf2_sha256$-10$c2FsdHNhbHRzYWx0$aGFzaGhhc2hoYXNo',
    'pbkdf2_sha256$100000$not!base64!salt$not!base64!hash',
    'pbkdf2_sha256$100000$c2FsdA==$aGFzaA==', // truncated salt (4 bytes) & hash (4 bytes)
  ];

  for (const badHash of malformedHashes) {
    const res = await verifyPassword(password, badHash);
    assert(res === false, `verifyPassword: should safely return false for malformed hash: "${badHash}"`);
  }
}

// ============================================================================
// 2. Validation Helpers
// ============================================================================

// 2a. validateUsername
{
  assert(validateUsername('alice').valid === true, 'validateUsername: alice is valid');
  assert(validateUsername('bob_123').valid === true, 'validateUsername: bob_123 is valid');
  assert(validateUsername('user-name').valid === true, 'validateUsername: user-name is valid');

  const trimmed = validateUsername('  steve_jobs  ');
  assert(trimmed.valid === true && trimmed.username === 'steve_jobs', 'validateUsername: trims whitespace');

  assert(validateUsername('ab').valid === false, 'validateUsername: 2 chars is too short');
  assert(validateUsername('a'.repeat(33)).valid === false, 'validateUsername: 33 chars is too long');
  assert(validateUsername('user name').valid === false, 'validateUsername: space in middle is invalid');
  assert(validateUsername('user@domain').valid === false, 'validateUsername: @ symbol is invalid');
  assert(validateUsername(null).valid === false, 'validateUsername: null is invalid');
  assert(validateUsername(123).valid === false, 'validateUsername: number is invalid');
}

// 2b. validatePassword
{
  assert(validatePassword('12345678').valid === true, 'validatePassword: 8 chars is valid');
  assert(validatePassword('a'.repeat(128)).valid === true, 'validatePassword: 128 chars is valid');

  assert(validatePassword('1234567').valid === false, 'validatePassword: 7 chars is too short');
  assert(validatePassword('a'.repeat(129)).valid === false, 'validatePassword: 129 chars is too long');
  assert(validatePassword(null).valid === false, 'validatePassword: null is invalid');
  assert(validatePassword(undefined).valid === false, 'validatePassword: undefined is invalid');
}

// 2c. Cookie helpers
{
  const localReq = new Request('http://localhost:3000/api/auth/login');
  const localCookie = buildSessionCookie('test_token', localReq);
  assert(localCookie.includes('ese_session=test_token'), 'buildSessionCookie: has session token');
  assert(localCookie.includes('Max-Age=2592000'), 'buildSessionCookie: 30-day Max-Age');
  assert(localCookie.includes('Path=/'), 'buildSessionCookie: Path=/');
  assert(localCookie.includes('HttpOnly'), 'buildSessionCookie: HttpOnly');
  assert(localCookie.includes('SameSite=Lax'), 'buildSessionCookie: SameSite=Lax');
  assert(!localCookie.includes('Secure'), 'buildSessionCookie: insecure request omits Secure');

  const prodReq = new Request('https://easyschemedit.com/api/auth/login');
  const prodCookie = buildSessionCookie('test_token', prodReq);
  assert(prodCookie.includes('Secure'), 'buildSessionCookie: secure request includes Secure');

  const clearCookie = buildClearSessionCookie(localReq);
  assert(clearCookie.includes('Max-Age=0'), 'buildClearSessionCookie: sets Max-Age=0');
}

// ============================================================================
// 3. Mock Database & Auth Handlers
// ============================================================================

interface MockUserRow {
  id: string;
  username: string;
  password_hash: string;
  created_at: Date;
}

interface MockSessionRow {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  created_at: Date;
}

function createMockSqlClient() {
  const users: MockUserRow[] = [];
  const sessions: MockSessionRow[] = [];

  const sql = async (strings: TemplateStringsArray, ...values: any[]) => {
    const rawSql = strings.join('?').replace(/\s+/g, ' ').trim();

    // 1. SELECT id FROM users WHERE LOWER(username) = LOWER(?)
    if (rawSql.includes('SELECT id FROM users WHERE LOWER(username) = LOWER(?)')) {
      const uname = String(values[0]).toLowerCase();
      const match = users.find(u => u.username.toLowerCase() === uname);
      return match ? [{ id: match.id }] : [];
    }

    // 2. INSERT INTO users
    if (rawSql.includes('INSERT INTO users')) {
      const [id, username, password_hash] = values;
      const lower = String(username).toLowerCase();
      if (users.some(u => u.username.toLowerCase() === lower)) {
        const err = new Error('duplicate key value violates unique constraint "users_username_lower_uidx"');
        (err as any).code = '23505';
        throw err;
      }
      const record: MockUserRow = { id, username, password_hash, created_at: new Date() };
      users.push(record);
      return [record];
    }

    // 3. INSERT INTO sessions
    if (rawSql.includes('INSERT INTO sessions')) {
      const [id, user_id, token_hash, expires_at] = values;
      const record: MockSessionRow = {
        id,
        user_id,
        token_hash,
        expires_at: new Date(expires_at),
        created_at: new Date(),
      };
      sessions.push(record);
      return [record];
    }

    // 4. SELECT id, username, password_hash FROM users WHERE LOWER(username) = LOWER(?)
    if (rawSql.includes('SELECT id, username, password_hash FROM users WHERE LOWER(username) = LOWER(?)')) {
      const uname = String(values[0]).toLowerCase();
      const match = users.find(u => u.username.toLowerCase() === uname);
      return match
        ? [{ id: match.id, username: match.username, password_hash: match.password_hash }]
        : [];
    }

    // 5. SELECT s.id AS session_id, s.user_id, u.username FROM sessions s JOIN users u
    if (rawSql.includes('FROM sessions s') && rawSql.includes('JOIN users u')) {
      const tokenHash = values[0];
      const now = new Date();
      const session = sessions.find(s => s.token_hash === tokenHash && s.expires_at > now);
      if (!session) return [];
      const user = users.find(u => u.id === session.user_id);
      if (!user) return [];
      return [
        {
          session_id: session.id,
          user_id: session.user_id,
          username: user.username,
        },
      ];
    }

    // 6. DELETE FROM sessions WHERE token_hash = ?
    if (rawSql.includes('DELETE FROM sessions WHERE token_hash = ?')) {
      const tokenHash = values[0];
      const idx = sessions.findIndex(s => s.token_hash === tokenHash);
      if (idx !== -1) {
        sessions.splice(idx, 1);
      }
      return [];
    }

    throw new Error(`Unhandled mock SQL query: ${rawSql}`);
  };

  return { sql: sql as unknown as SqlClient, users, sessions };
}

const mockEnv: Env = {
  ASSETS: {} as any,
  PROJECTS_BUCKET: {} as any,
  NEON_DATABASE_URL: 'postgres://user:pass@localhost/db',
  SESSION_SECRET: 'test-secret',
};

// 3a. handleRegister tests
{
  const mock = createMockSqlClient();

  // Method not allowed
  const getReq = new Request('http://localhost/api/auth/register', { method: 'GET' });
  const getRes = await handleRegister(getReq, mockEnv, mock.sql);
  assert(getRes.status === 405, 'handleRegister: GET should return 405');

  // Invalid JSON
  const badJsonReq = new Request('http://localhost/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: 'not-json',
  });
  const badJsonRes = await handleRegister(badJsonReq, mockEnv, mock.sql);
  assert(badJsonRes.status === 400, 'handleRegister: bad JSON should return 400');

  // Validation failures
  const shortUserReq = new Request('http://localhost/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'ab', password: 'password123' }),
  });
  const shortUserRes = await handleRegister(shortUserReq, mockEnv, mock.sql);
  assert(shortUserRes.status === 400, 'handleRegister: short username should return 400');

  const shortPassReq = new Request('http://localhost/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'alice', password: 'short' }),
  });
  const shortPassRes = await handleRegister(shortPassReq, mockEnv, mock.sql);
  assert(shortPassRes.status === 400, 'handleRegister: short password should return 400');

  // Successful registration
  const validRegReq = new Request('http://localhost/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: '  Alice_99  ', password: 'SecretPassword123!' }),
  });
  const validRegRes = await handleRegister(validRegReq, mockEnv, mock.sql);
  assert(validRegRes.status === 201, 'handleRegister: successful registration should return 201');

  const regBody = await validRegRes.json() as any;
  assert(regBody.user && typeof regBody.user.id === 'string', 'handleRegister: response has user.id');
  assert(regBody.user.username === 'Alice_99', 'handleRegister: response has trimmed username');
  assert(regBody.password === undefined, 'handleRegister: must not return password');
  assert(regBody.user.password_hash === undefined, 'handleRegister: must not return password_hash');

  const setCookie = validRegRes.headers.get('Set-Cookie');
  assert(setCookie?.includes('ese_session=') === true, 'handleRegister: sets ese_session cookie');
  assert(mock.users.length === 1, 'handleRegister: user added to mock DB');
  assert(mock.sessions.length === 1, 'handleRegister: session added to mock DB');

  // Duplicate registration: same username
  const dupReq = new Request('http://localhost/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'alice_99', password: 'AnotherPassword123!' }),
  });
  const dupRes = await handleRegister(dupReq, mockEnv, mock.sql);
  assert(dupRes.status === 409, 'handleRegister: duplicate username (case-insensitive) should return 409');
}

// 3b. handleLogin tests
{
  const mock = createMockSqlClient();

  // Seed a registered user
  const regReq = new Request('http://localhost/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'BuilderBob', password: 'MyBuildingPass123' }),
  });
  const regRes = await handleRegister(regReq, mockEnv, mock.sql);
  assert(regRes.status === 201, 'Seed register successful');

  // Missing fields
  const missingReq = new Request('http://localhost/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'BuilderBob' }),
  });
  const missingRes = await handleLogin(missingReq, mockEnv, mock.sql);
  assert(missingRes.status === 400, 'handleLogin: missing password should return 400');

  // Non-existent user
  const nonExistReq = new Request('http://localhost/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'NonExistent', password: 'MyBuildingPass123' }),
  });
  const nonExistRes = await handleLogin(nonExistReq, mockEnv, mock.sql);
  assert(nonExistRes.status === 401, 'handleLogin: unknown user should return 401');

  // Wrong password
  const wrongPassReq = new Request('http://localhost/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'BuilderBob', password: 'WrongPassword999' }),
  });
  const wrongPassRes = await handleLogin(wrongPassReq, mockEnv, mock.sql);
  assert(wrongPassRes.status === 401, 'handleLogin: wrong password should return 401');

  // Successful login (with lowercase username lookup)
  const loginReq = new Request('http://localhost/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'builderbob', password: 'MyBuildingPass123' }),
  });
  const loginRes = await handleLogin(loginReq, mockEnv, mock.sql);
  assert(loginRes.status === 200, 'handleLogin: correct credentials should return 200');

  const loginBody = await loginRes.json() as any;
  assert(loginBody.user.username === 'BuilderBob', 'handleLogin: preserves original display username');
  assert(loginBody.user.password_hash === undefined, 'handleLogin: does not return hash');

  const loginCookie = loginRes.headers.get('Set-Cookie');
  assert(loginCookie?.includes('ese_session=') === true, 'handleLogin: sets ese_session cookie');
}

// 3c. requireSession & handleMe tests
{
  const mock = createMockSqlClient();

  // Register user
  const regReq = new Request('http://localhost/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'RedstoneMaster', password: 'RedstonePass123!' }),
  });
  const regRes = await handleRegister(regReq, mockEnv, mock.sql);
  const cookieHeader = regRes.headers.get('Set-Cookie')!;
  const sessionToken = cookieHeader.split(';')[0].replace('ese_session=', '');

  // 1. Unauthenticated request to handleMe
  const anonReq = new Request('http://localhost/api/auth/me');
  const anonRes = await handleMe(anonReq, mockEnv, mock.sql);
  assert(anonRes.status === 401, 'handleMe: unauthenticated request returns 401');

  // 2. Request with invalid token
  const badTokenReq = new Request('http://localhost/api/auth/me', {
    headers: { Cookie: 'ese_session=invalid_token_12345' },
  });
  const badTokenRes = await handleMe(badTokenReq, mockEnv, mock.sql);
  assert(badTokenRes.status === 401, 'handleMe: invalid session returns 401');

  // 3. Request with valid session token
  const authReq = new Request('http://localhost/api/auth/me', {
    headers: { Cookie: `ese_session=${sessionToken}` },
  });
  const authRes = await handleMe(authReq, mockEnv, mock.sql);
  assert(authRes.status === 200, 'handleMe: valid session returns 200');
  const meBody = await authRes.json() as any;
  assert(meBody.user.username === 'RedstoneMaster', 'handleMe: returns correct user username');

  // Direct requireSession test
  const sessionUser = await requireSession(authReq, mockEnv, mock.sql);
  assert(sessionUser !== null, 'requireSession: should return SessionUser');
  assert(sessionUser?.username === 'RedstoneMaster', 'requireSession: username matches');
  assert(typeof sessionUser?.userId === 'string', 'requireSession: userId is string');
  assert(typeof sessionUser?.sessionId === 'string', 'requireSession: sessionId is string');

  // 4. Expired session test
  const expiredMock = createMockSqlClient();
  const expRegReq = new Request('http://localhost/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'ExpiredUser', password: 'Password123!' }),
  });
  const expRegRes = await handleRegister(expRegReq, mockEnv, expiredMock.sql);
  const expCookieHeader = expRegRes.headers.get('Set-Cookie')!;
  const expToken = expCookieHeader.split(';')[0].replace('ese_session=', '');

  // Force expiration in mock DB
  expiredMock.sessions[0].expires_at = new Date(Date.now() - 1000);

  const expReq = new Request('http://localhost/api/auth/me', {
    headers: { Cookie: `ese_session=${expToken}` },
  });
  const expRes = await handleMe(expReq, mockEnv, expiredMock.sql);
  assert(expRes.status === 401, 'handleMe: expired session returns 401');
}

// 3d. handleLogout tests
{
  const mock = createMockSqlClient();

  // Register user
  const regReq = new Request('http://localhost/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'LogoutUser', password: 'Password123!' }),
  });
  const regRes = await handleRegister(regReq, mockEnv, mock.sql);
  const cookieHeader = regRes.headers.get('Set-Cookie')!;
  const sessionToken = cookieHeader.split(';')[0].replace('ese_session=', '');

  assert(mock.sessions.length === 1, 'Initial session exists in DB');

  // Logout request
  const logoutReq = new Request('http://localhost/api/auth/logout', {
    method: 'POST',
    headers: { Cookie: `ese_session=${sessionToken}` },
  });
  const logoutRes = await handleLogout(logoutReq, mockEnv, mock.sql);
  assert(logoutRes.status === 200, 'handleLogout: returns 200');

  const logoutCookie = logoutRes.headers.get('Set-Cookie')!;
  assert(logoutCookie.includes('Max-Age=0'), 'handleLogout: clears cookie with Max-Age=0');
  assert(mock.sessions.length === 0, 'handleLogout: session deleted from DB');

  // Subsequent me request should now be unauthorized
  const meReq = new Request('http://localhost/api/auth/me', {
    headers: { Cookie: `ese_session=${sessionToken}` },
  });
  const meRes = await handleMe(meReq, mockEnv, mock.sql);
  assert(meRes.status === 401, 'handleMe: logged out session is now 401');
}

console.log('✓ All Slice 2 Auth Crypto & Handler tests passed successfully!');
