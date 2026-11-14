import type { Env } from './env.ts';
import { getDb, type SqlClient } from './db.ts';
import { json, errorJson, parseCookies, isSecureRequest } from './http.ts';
import {
  hashPassword,
  verifyPassword,
  generateSessionToken,
  sha256Hex,
} from './crypto.ts';

export interface SessionUser {
  userId: string;
  username: string;
  sessionId: string;
}

export const SESSION_COOKIE_NAME = 'ese_session';
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days = 2,592,000s

export function buildSessionCookie(
  token: string,
  request: Request,
  maxAgeSeconds = SESSION_MAX_AGE_SECONDS
): string {
  const secure = isSecureRequest(request) ? '; Secure' : '';
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Max-Age=${maxAgeSeconds}; Path=/; HttpOnly; SameSite=Lax${secure}`;
}

export function buildClearSessionCookie(request: Request): string {
  const secure = isSecureRequest(request) ? '; Secure' : '';
  return `${SESSION_COOKIE_NAME}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax${secure}`;
}

export function validateUsername(
  raw: unknown
): { valid: true; username: string } | { valid: false; error: string } {
  if (typeof raw !== 'string') {
    return { valid: false, error: 'Username must be a string' };
  }
  const trimmed = raw.trim();
  if (trimmed.length < 3 || trimmed.length > 32) {
    return { valid: false, error: 'Username must be between 3 and 32 characters' };
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
    return { valid: false, error: 'Username may only contain letters, numbers, underscores, and hyphens' };
  }
  return { valid: true, username: trimmed };
}

export function validatePassword(
  raw: unknown
): { valid: true; password: string } | { valid: false; error: string } {
  if (typeof raw !== 'string') {
    return { valid: false, error: 'Password must be a string' };
  }
  if (raw.length < 8) {
    return { valid: false, error: 'Password must be at least 8 characters' };
  }
  if (raw.length > 128) {
    return { valid: false, error: 'Password must not exceed 128 characters' };
  }
  return { valid: true, password: raw };
}

export async function requireSession(
  request: Request,
  env: Env,
  sqlOverride?: SqlClient
): Promise<SessionUser | null> {
  const cookies = parseCookies(request);
  const token = cookies[SESSION_COOKIE_NAME];
  if (!token) {
    return null;
  }
  const tokenHash = await sha256Hex(token);
  const sql = sqlOverride ?? getDb(env);
  const rows = (await sql`
    SELECT s.id AS session_id, s.user_id, u.username
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ${tokenHash}
      AND s.expires_at > now()
    LIMIT 1
  `) as Array<{ session_id: string; user_id: string; username: string }>;
  if (!rows || rows.length === 0) {
    return null;
  }
  const row = rows[0];
  return {
    userId: row.user_id,
    username: row.username,
    sessionId: row.session_id,
  };
}

export async function handleRegister(
  request: Request,
  env: Env,
  sqlOverride?: SqlClient
): Promise<Response> {
  if (request.method !== 'POST') {
    return errorJson('Method Not Allowed', 405);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorJson('Invalid JSON payload', 400);
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return errorJson('Invalid request body', 400);
  }

  const { username: rawUsername, password: rawPassword } = body as Record<string, unknown>;

  const userValidation = validateUsername(rawUsername);
  if (!userValidation.valid) {
    return errorJson(userValidation.error, 400);
  }
  const username = userValidation.username;

  const passValidation = validatePassword(rawPassword);
  if (!passValidation.valid) {
    return errorJson(passValidation.error, 400);
  }
  const password = passValidation.password;

  const sql = sqlOverride ?? getDb(env);

  // Check if username is already taken (case-insensitive)
  const existing = (await sql`
    SELECT id FROM users WHERE LOWER(username) = LOWER(${username}) LIMIT 1
  `) as Array<{ id: string }>;
  if (existing && existing.length > 0) {
    return errorJson('Username already taken', 409);
  }

  const passwordHash = await hashPassword(password);
  const userId = crypto.randomUUID();
  const sessionId = crypto.randomUUID();
  const rawToken = generateSessionToken();
  const tokenHash = await sha256Hex(rawToken);
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000).toISOString();

  try {
    await sql`
      INSERT INTO users (id, username, password_hash)
      VALUES (${userId}, ${username}, ${passwordHash})
    `;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('unique') || msg.includes('duplicate') || msg.includes('23505')) {
      return errorJson('Username already taken', 409);
    }
    throw err;
  }

  await sql`
    INSERT INTO sessions (id, user_id, token_hash, expires_at)
    VALUES (${sessionId}, ${userId}, ${tokenHash}, ${expiresAt})
  `;

  return json(
    { user: { id: userId, username } },
    201,
    { 'Set-Cookie': buildSessionCookie(rawToken, request) }
  );
}

export async function handleLogin(
  request: Request,
  env: Env,
  sqlOverride?: SqlClient
): Promise<Response> {
  if (request.method !== 'POST') {
    return errorJson('Method Not Allowed', 405);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorJson('Invalid JSON payload', 400);
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return errorJson('Invalid request body', 400);
  }

  const { username: rawUsername, password: rawPassword } = body as Record<string, unknown>;

  if (
    typeof rawUsername !== 'string' ||
    !rawUsername.trim() ||
    typeof rawPassword !== 'string' ||
    !rawPassword
  ) {
    return errorJson('Username and password are required', 400);
  }

  const username = rawUsername.trim();
  const password = rawPassword;

  const sql = sqlOverride ?? getDb(env);

  const rows = (await sql`
    SELECT id, username, password_hash
    FROM users
    WHERE LOWER(username) = LOWER(${username})
    LIMIT 1
  `) as Array<{ id: string; username: string; password_hash: string }>;

  if (!rows || rows.length === 0) {
    return errorJson('Invalid username or password', 401);
  }

  const user = rows[0];

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    return errorJson('Invalid username or password', 401);
  }

  const sessionId = crypto.randomUUID();
  const rawToken = generateSessionToken();
  const tokenHash = await sha256Hex(rawToken);
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000).toISOString();

  await sql`
    INSERT INTO sessions (id, user_id, token_hash, expires_at)
    VALUES (${sessionId}, ${user.id}, ${tokenHash}, ${expiresAt})
  `;

  return json(
    { user: { id: user.id, username: user.username } },
    200,
    { 'Set-Cookie': buildSessionCookie(rawToken, request) }
  );
}

export async function handleLogout(
  request: Request,
  env: Env,
  sqlOverride?: SqlClient
): Promise<Response> {
  if (request.method !== 'POST') {
    return errorJson('Method Not Allowed', 405);
  }

  const cookies = parseCookies(request);
  const token = cookies[SESSION_COOKIE_NAME];

  if (token) {
    const tokenHash = await sha256Hex(token);
    const sql = sqlOverride ?? getDb(env);
    await sql`
      DELETE FROM sessions WHERE token_hash = ${tokenHash}
    `;
  }

  return json(
    { ok: true },
    200,
    { 'Set-Cookie': buildClearSessionCookie(request) }
  );
}

export async function handleMe(
  request: Request,
  env: Env,
  sqlOverride?: SqlClient
): Promise<Response> {
  if (request.method !== 'GET') {
    return errorJson('Method Not Allowed', 405);
  }

  const user = await requireSession(request, env, sqlOverride);
  if (!user) {
    return errorJson('Unauthorized', 401);
  }

  return json({
    user: {
      id: user.userId,
      username: user.username,
    },
  });
}
