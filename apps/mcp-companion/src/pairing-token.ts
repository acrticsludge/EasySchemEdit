// apps/mcp-companion/src/pairing-token.ts
// Pairing token lifecycle + connection security (SUBSPEC-F F1, F2, F12, F13, F14; §2.2.3, §2.2.4,
// §2.6, §3.1, §4.1).
// Pure TypeScript, zero framework/browser/Node/Three.js/MCP imports.
// Crypto (256-bit token generation and SHA-256), the clock and the session-id source are INJECTED,
// so this module needs no Node built-ins and is deterministic under test. Production wiring passes
// crypto.randomBytes(32).toString('hex') and createHash('sha256') — see the slice f-2 plan.
//
// Design decisions (docs/research/subplan-f.md):
//   F-2.1 PNA is granted only when the preflight asked for it
//   F-2.2 DNS-rebinding defence validates the port-agnostic Host hostname against an allowlist
//   F-2.3 CORS answers only an exact allowlisted origin; no wildcard, ever
//   F-2.4 token comparison is constant-time over digests (never early-exit on plaintext)
//   F-2.5 one listener on 43127 (SPEC-F F2)
//
// F12/F14: only the SHA-256 digest is retained. The plaintext leaves `generate()` exactly once and
// is never logged, put in a URL, or echoed in a response.

// ============================================================================
// Pairing Token (original type surface, retained)
// ============================================================================

export type PairingToken = {
  token: string;              // 256-bit random token (never stored in plaintext)
  tokenHash: string;          // SHA-256 hash of token (stored instead of plaintext)
  projectId: string;          // bound to project
  createdAt: number;          // epoch ms
  ttlMs: number;              // 300000 (5 minutes)
  used: boolean;              // one-time use
  revoked: boolean;           // manually revoked
};

// ============================================================================
// Pairing Token State
// ============================================================================

export type PairingTokenState = {
  pendingTokens: Map<string, PairingToken>;   // tokenHash -> token
  usedTokens: Map<string, PairingToken>;      // used token hashes (for replay detection)
  revokedTokens: Set<string>;                 // revoked token hashes
};

// ============================================================================
// Security Configuration
// ============================================================================

export type SecurityConfig = {
  loopbackOnly: boolean;            // true - only bind to 127.0.0.1
  allowedOrigins: string[];         // exact origin allowlist (e.g. ['http://localhost:5173'])
  corsEnabled: boolean;             // enable CORS
  corsAllowCredentials: boolean;    // allow credentials in CORS
  pnaEnabled: boolean;              // enable Chrome Private Network Access validation
  dnsRebindingProtection: boolean;  // enable DNS rebinding protection
  maxConnectionAttempts: number;    // max failed connection attempts before block
  blockDurationMs: number;          // duration of block after max attempts
};

/** `SecurityConfig` plus the policy values the authority needs at runtime (F-2.2, §2.6). */
export type SecurityPolicy = SecurityConfig & {
  idleTimeoutMs: number;            // 1800000 (30 minutes)
  hostAllowlist: string[];          // port-agnostic allowed Host hostnames
};

// ============================================================================
// Connection Security
// ============================================================================

export type ConnectionSecurity = {
  connectionId: string;
  clientAddress: string;            // client IP address
  clientPort: number;
  serverAddress: string;            // server IP address (always 127.0.0.1)
  serverPort: number;
  connectedAt: number;              // epoch ms
  lastActivityAt: number;           // epoch ms
  pairingTokenUsed?: string;        // token hash used for this connection
  origin?: string;                  // Origin header from client
  userAgent?: string;               // User-Agent header
  isSecure: boolean;                // all security checks passed
};

// ============================================================================
// Pairing Protocol (original interface, retained)
// ============================================================================

export type PairingProtocol = {
  generatePairingToken(projectId: string): PairingToken;
  hashToken(token: string): string; // SHA-256 hash
  validateToken(token: string, tokenHash: string): boolean;
  isTokenExpired(token: PairingToken): boolean;
  isTokenUsed(token: PairingToken): boolean;
  revokeToken(token: string): void;
  checkOrigin(origin: string, allowedOrigins: string[]): boolean;
  checkLoopback(address: string): boolean; // true if 127.0.0.1 or ::1
  checkPNA(clientAddress: string): boolean; // true if private network access allowed
};

// ============================================================================
// Constants
// ============================================================================

// Default pairing token TTL: 5 minutes (300000ms) — F1
export const DEFAULT_PAIRING_TOKEN_TTL_MS = 300_000;

// Default max connection attempts before block
export const DEFAULT_MAX_CONNECTION_ATTEMPTS = 5;

// Default block duration: 5 minutes (300000ms)
export const DEFAULT_BLOCK_DURATION_MS = 300_000;

// §2.6: idle session timeout.
export const DEFAULT_SESSION_IDLE_TIMEOUT_MS = 1_800_000;

// SPEC-F F2: the browser bridge port.
export const COMPANION_PORT = 43127;

// F-2.2: port-agnostic allowed Host hostnames.
export const ALLOWED_HOSTNAMES: readonly string[] = ['localhost', '127.0.0.1', '[::1]'];

// §2.6: the plaintext token is 256 bits.
export const PAIRING_TOKEN_BYTES = 32;

// Loopback addresses
export const LOOPBACK_ADDRESSES: ReadonlySet<string> = new Set([
  '127.0.0.1',
  '::1',
  '0:0:0:0:0:0:0:1',
]);

// ============================================================================
// Lifecycle records
// ============================================================================

export type PairingTokenRecord = {
  tokenHash: string;             // SHA-256 digest; the plaintext is never retained
  projectId: string | null;      // null = usable for any project (headless)
  createdAt: number;
  expiresAt: number;
  usedAt: number | null;
  revokedAt: number | null;
  sessionId: string | null;
  idleDeadline: number | null;
};

export type ConnectFailure =
  | 'NOT_FOUND'
  | 'EXPIRED'
  | 'ALREADY_USED'
  | 'REVOKED'
  | 'PROJECT_MISMATCH'
  | 'RATE_LIMITED';

export type ConnectResult =
  | { ok: true; sessionId: string; projectId: string; record: PairingTokenRecord }
  | { ok: false; reason: ConnectFailure };

export type PairingAuthorityServices = {
  /** 256-bit CSPRNG token as hex (64 chars). Production: `crypto.randomBytes(32).toString('hex')`. */
  randomToken(): string;
  /** SHA-256 as hex. Production: `createHash('sha256').update(value).digest('hex')`. */
  sha256(value: string): string;
  now(): number;
};

export type PairingAuthorityOptions = {
  services: PairingAuthorityServices;
  /** Exact origins permitted for CORS. Default: none (no browser origin allowed). */
  allowedOrigins?: string[];
  pairingTokenTtlMs?: number;
  idleTimeoutMs?: number;
  maxConnectionAttempts?: number;
  blockDurationMs?: number;
  /** Host hostnames accepted on the bridge. Default: `ALLOWED_HOSTNAMES`. */
  hostAllowlist?: readonly string[];
  generateSessionId?: () => string;
};

export type PairingAuthority = {
  /** Mints a token. The plaintext is in the return value ONLY and is never retained (F12/F14). */
  generate(projectId?: string): { token: string; record: PairingTokenRecord };
  /** Validates and consumes a token, minting a session on success. */
  connect(input: { token: string; projectId?: string; clientId?: string }): ConnectResult;
  /**
   * Authenticate a request from an ALREADY-PAIRED client. A pairing token is one-time use (F1), so
   * subsequent requests cannot re-present it; instead the client presents the session id it was
   * given and this refreshes the idle deadline. Returns the session's project binding.
   */
  authenticateSession(sessionId: string): { ok: true; projectId: string | null } | { ok: false; reason: 'NOT_FOUND' | 'EXPIRED' };
  /** Records activity on a live session, refreshing its idle deadline. */
  touch(sessionId: string): boolean;
  /** Drops sessions idle past the timeout; returns the dropped session ids. */
  sweepIdle(): string[];
  revoke(token: string): boolean;
  revokeSession(sessionId: string): boolean;
  records(): PairingTokenRecord[];
  registerFailure(clientId: string): { blocked: boolean; blockUntil: number | null };
  isBlocked(clientId: string): boolean;
  clearFailures(clientId: string): void;
  activeSessions(): number;
  config(): SecurityPolicy;
};

// ============================================================================
// Constant-time comparison (F-2.4)
// ============================================================================

/**
 * Constant-time equality. Both sides are compared in full regardless of where they differ, so a
 * caller cannot learn a token byte-by-byte from response timing.
 */
export function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

// ============================================================================
// Host / Origin / PNA policy (F-2.1, F-2.2, F-2.3)
// ============================================================================

export type HostCheck = { ok: boolean; hostname?: string; reason?: string };

/**
 * Validate the `Host` header against an allowlist of hostnames, port-agnostically (F-2.2).
 * Parsed with the URL API so IPv4, bracketed IPv6 and plain hostnames all normalise the same way.
 * A missing or unparseable Host is refused: an attacker who controls DNS still cannot make the
 * browser send a Host that is not in the allowlist.
 */
export function checkHost(
  hostHeader: string | undefined,
  allowed: readonly string[] = ALLOWED_HOSTNAMES,
): HostCheck {
  if (hostHeader === undefined || hostHeader.trim().length === 0) {
    return { ok: false, reason: 'missing Host header' };
  }
  const raw = hostHeader.trim();
  // A Host header is authority-only; anything with a scheme or path is malformed.
  if (raw.includes('://') || /[/?#]/.test(raw)) {
    return { ok: false, reason: `malformed Host header: ${raw}` };
  }

  let hostname: string;
  try {
    hostname = new URL(`http://${raw}`).hostname;
  } catch {
    return { ok: false, reason: `unparseable Host header: ${raw}` };
  }
  if (hostname.length === 0) {
    return { ok: false, reason: `unparseable Host header: ${raw}` };
  }

  // URL strips IPv6 brackets for non-special schemes; accept either spelling.
  const bracketForm = hostname.startsWith('[') ? hostname : `[${hostname}]`;
  if (allowed.includes(hostname) || allowed.includes(bracketForm)) {
    return { ok: true, hostname };
  }
  return { ok: false, hostname, reason: `Host not in allowlist: ${hostname}` };
}

export type OriginCheck = {
  ok: boolean;
  browser: boolean;
  origin?: string;
  reason?: string;
};

/**
 * Validate an `Origin` header (F-2.3). Exact match only: scheme + host + port must all agree, so
 * a differing port and a superstring origin such as `http://localhost:5173.evil.com` are refused.
 * A missing Origin means a non-browser client (curl, the MCP SDK itself), which CORS does not govern.
 */
export function checkOrigin(
  originHeader: string | undefined,
  allowedOrigins: readonly string[],
): OriginCheck {
  if (originHeader === undefined || originHeader.trim().length === 0) {
    return { ok: true, browser: false };
  }
  const origin = originHeader.trim();
  if (origin === 'null') {
    return { ok: false, browser: true, reason: 'the opaque "null" origin is not allowed' };
  }
  if (allowedOrigins.includes(origin)) {
    return { ok: true, browser: true, origin };
  }
  return { ok: false, browser: true, origin, reason: `origin not in allowlist: ${origin}` };
}

export type CorsPolicy = {
  allowedOrigins: readonly string[];
  allowedMethods: readonly string[];
  allowedHeaders: readonly string[];
};

export type CorsDecision = {
  allowed: boolean;
  status: number;
  headers: Record<string, string>;
  reason?: string;
};

/**
 * Build the response to a CORS preflight (F-2.1, F-2.3).
 * - allowlisted origin ⇒ 204 echoing that exact origin (never `*`) with `Vary: Origin`
 * - PNA granted (`Access-Control-Allow-Private-Network: true`) only when the preflight asked
 * - non-allowlisted origin, absent origin, or a disallowed method ⇒ refused with no CORS headers
 */
export function corsPreflightResponse(
  input: {
    origin?: string;
    requestedMethod?: string;
    requestedHeaders?: string;
    pnaRequested?: boolean;
  },
  policy: CorsPolicy,
): CorsDecision {
  const origin = input.origin?.trim();

  if (origin === undefined || origin.length === 0) {
    // A preflight is a browser-only concept; with no Origin there is nothing to grant.
    return { allowed: false, status: 403, headers: {}, reason: 'preflight without an Origin header' };
  }

  const originCheck = checkOrigin(origin, policy.allowedOrigins);
  if (!originCheck.ok) {
    return { allowed: false, status: 403, headers: {}, reason: originCheck.reason };
  }

  const method = (input.requestedMethod ?? 'POST').toUpperCase();
  if (!policy.allowedMethods.map((m) => m.toUpperCase()).includes(method)) {
    return { allowed: false, status: 403, headers: {}, reason: `method not allowed: ${method}` };
  }

  const headers: Record<string, string> = {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': policy.allowedMethods.join(', '),
    'Access-Control-Allow-Headers': policy.allowedHeaders.join(', '),
    Vary: 'Origin',
    'Access-Control-Max-Age': '600',
  };

  if (input.pnaRequested === true) {
    // Chrome blocks the request unless this exact header comes back on the preflight.
    headers['Access-Control-Allow-Private-Network'] = 'true';
  }

  return { allowed: true, status: 204, headers };
}

/**
 * Classify an address into the PNA address spaces (F-2.1). `local` is loopback, `private` covers
 * RFC1918 / link-local / ULA / link-local IPv6, everything else is `public`.
 */
export function classifyAddressSpace(address: string): 'public' | 'private' | 'local' {
  const value = address.trim();

  if (isLoopback(value)) return 'local';

  // IPv4-mapped IPv6.
  if (value.startsWith('::ffff:')) return classifyAddressSpace(value.slice('::ffff:'.length));

  if (isIpv4(value)) {
    const [a, b] = value.split('.').map((part) => Number(part));
    if (a === 10) return 'private';
    if (a === 172 && b >= 16 && b <= 31) return 'private';
    if (a === 192 && b === 168) return 'private';
    if (a === 169 && b === 254) return 'private';
    return 'public';
  }

  if (isIpv6(value)) {
    const lower = value.toLowerCase();
    if (/^f[cd][0-9a-f]{2}:/.test(lower)) return 'private'; // fc00::/7 unique local
    if (/^fe[89ab][0-9a-f]:/.test(lower)) return 'private'; // fe80::/10 link-local
    return 'public';
  }

  return 'public';
}

function isIpv4(value: string): boolean {
  const parts = value.split('.');
  if (parts.length !== 4) return false;
  return parts.every(
    (part) => /^\d{1,3}$/.test(part) && Number(part) >= 0 && Number(part) <= 255,
  );
}

function isIpv6(value: string): boolean {
  return value.includes(':') && /^[0-9a-fA-F:.]+$/.test(value);
}

function isLoopback(address: string): boolean {
  if (address === '::1' || address === '0:0:0:0:0:0:0:1') return true;
  if (address === '::ffff:127.0.0.1') return true;
  // Whole 127.0.0.0/8 block.
  return /^127\./.test(address) && isIpv4(address);
}

/** Retained helper: true only for genuine loopback addresses (F2: "loopback-only binding"). */
export function checkLoopback(address: string): boolean {
  return isLoopback(address.trim());
}

/** Retained helper: true when the client address is local or private (PNA-shaped). */
export function checkPNA(clientAddress: string): boolean {
  const space = classifyAddressSpace(clientAddress);
  return space === 'local' || space === 'private';
}

// ============================================================================
// Authority
// ============================================================================

let fallbackSessionCounter = 0;

export function createPairingAuthority(options: PairingAuthorityOptions): PairingAuthority {
  const { services } = options;
  const allowedOrigins = options.allowedOrigins ?? [];
  const ttlMs = options.pairingTokenTtlMs ?? DEFAULT_PAIRING_TOKEN_TTL_MS;
  const idleTimeoutMs = options.idleTimeoutMs ?? DEFAULT_SESSION_IDLE_TIMEOUT_MS;
  const maxAttempts = options.maxConnectionAttempts ?? DEFAULT_MAX_CONNECTION_ATTEMPTS;
  const blockDurationMs = options.blockDurationMs ?? DEFAULT_BLOCK_DURATION_MS;
  const hostAllowlist = options.hostAllowlist ?? ALLOWED_HOSTNAMES;
  const generateSessionId =
    options.generateSessionId ??
    (() => {
      fallbackSessionCounter += 1;
      return `session-${fallbackSessionCounter}`;
    });

  /** tokenHash → record. The only token storage; plaintext never lands here. */
  const recordsByHash = new Map<string, PairingTokenRecord>();
  const sessions = new Map<string, { idleDeadline: number }>();
  const failures = new Map<string, { count: number; blockUntil: number | null }>();

  function config(): SecurityPolicy {
    return {
      loopbackOnly: true,
      allowedOrigins: [...allowedOrigins],
      corsEnabled: true,
      corsAllowCredentials: false,
      pnaEnabled: true,
      dnsRebindingProtection: true,
      maxConnectionAttempts: maxAttempts,
      blockDurationMs,
      idleTimeoutMs,
      hostAllowlist: [...hostAllowlist],
    };
  }

  function isBlocked(clientId: string): boolean {
    const entry = failures.get(clientId);
    if (!entry || entry.blockUntil === null) return false;
    if (services.now() >= entry.blockUntil) {
      failures.delete(clientId);
      return false;
    }
    return true;
  }

  function registerFailure(clientId: string): { blocked: boolean; blockUntil: number | null } {
    const now = services.now();
    const entry = failures.get(clientId) ?? { count: 0, blockUntil: null };
    if (entry.blockUntil !== null && now >= entry.blockUntil) {
      entry.count = 0;
      entry.blockUntil = null;
    }
    entry.count += 1;
    if (entry.count >= maxAttempts) {
      entry.blockUntil = now + blockDurationMs;
    }
    failures.set(clientId, entry);
    return { blocked: entry.blockUntil !== null, blockUntil: entry.blockUntil };
  }

  function clearFailures(clientId: string): void {
    failures.delete(clientId);
  }

  function generate(projectId?: string): { token: string; record: PairingTokenRecord } {
    const now = services.now();
    const token = services.randomToken();
    const record: PairingTokenRecord = {
      tokenHash: services.sha256(token),
      projectId: projectId ?? null,
      createdAt: now,
      expiresAt: now + ttlMs,
      usedAt: null,
      revokedAt: null,
      sessionId: null,
      idleDeadline: null,
    };
    recordsByHash.set(record.tokenHash, record);
    return { token, record };
  }

  function connect(input: {
    token: string;
    projectId?: string;
    clientId?: string;
  }): ConnectResult {
    const now = services.now();

    if (input.clientId !== undefined && isBlocked(input.clientId)) {
      return { ok: false, reason: 'RATE_LIMITED' };
    }

    const digest = services.sha256(input.token);
    const record = recordsByHash.get(digest);
    if (!record) {
      if (input.clientId !== undefined) registerFailure(input.clientId);
      return { ok: false, reason: 'NOT_FOUND' };
    }

    if (record.revokedAt !== null) {
      if (input.clientId !== undefined) registerFailure(input.clientId);
      return { ok: false, reason: 'REVOKED' };
    }

    if (now > record.expiresAt) {
      // Expiry does not consume the record; the caller may mint a fresh token.
      if (input.clientId !== undefined) registerFailure(input.clientId);
      return { ok: false, reason: 'EXPIRED' };
    }

    if (record.usedAt !== null) {
      if (input.clientId !== undefined) registerFailure(input.clientId);
      return { ok: false, reason: 'ALREADY_USED' };
    }

    if (
      record.projectId !== null &&
      input.projectId !== undefined &&
      record.projectId !== input.projectId
    ) {
      // A mismatch does not consume the token: it may still be used for its own project.
      if (input.clientId !== undefined) registerFailure(input.clientId);
      return { ok: false, reason: 'PROJECT_MISMATCH' };
    }

    // Success consumes the token and mints a session.
    const sessionId = generateSessionId();
    record.usedAt = now;
    record.sessionId = sessionId;
    record.idleDeadline = now + idleTimeoutMs;
    sessions.set(sessionId, { idleDeadline: now + idleTimeoutMs });
    if (input.clientId !== undefined) clearFailures(input.clientId);

    return {
      ok: true,
      sessionId,
      projectId: record.projectId ?? input.projectId ?? '',
      record,
    };
  }

  /**
   * Authenticate an already-paired client by session id. The session map is the authority; the
   * idle deadline is refreshed on success so an active client is never swept mid-work.
   */
  function authenticateSession(
    sessionId: string,
  ): { ok: true; projectId: string | null } | { ok: false; reason: 'NOT_FOUND' | 'EXPIRED' } {
    const session = sessions.get(sessionId);
    if (!session) return { ok: false, reason: 'NOT_FOUND' };
    const now = services.now();
    if (now > session.idleDeadline) {
      sessions.delete(sessionId);
      return { ok: false, reason: 'EXPIRED' };
    }
    session.idleDeadline = now + idleTimeoutMs;

    let projectId: string | null = null;
    for (const record of recordsByHash.values()) {
      if (record.sessionId === sessionId) {
        record.idleDeadline = session.idleDeadline;
        projectId = record.projectId;
        break;
      }
    }
    return { ok: true, projectId };
  }

  function touch(sessionId: string): boolean {
    const session = sessions.get(sessionId);
    if (!session) return false;
    const now = services.now();
    if (now > session.idleDeadline) return false;
    session.idleDeadline = now + idleTimeoutMs;
    for (const record of recordsByHash.values()) {
      if (record.sessionId === sessionId) record.idleDeadline = session.idleDeadline;
    }
    return true;
  }

  function sweepIdle(): string[] {
    const now = services.now();
    const dropped: string[] = [];
    for (const [sessionId, session] of sessions) {
      if (now > session.idleDeadline) {
        sessions.delete(sessionId);
        dropped.push(sessionId);
      }
    }
    for (const record of recordsByHash.values()) {
      if (record.sessionId !== null && dropped.includes(record.sessionId)) {
        // The token stays consumed, so a dropped session can never be replayed (F1/F12).
        record.idleDeadline = null;
      }
    }
    return dropped;
  }

  function revoke(token: string): boolean {
    const record = recordsByHash.get(services.sha256(token));
    if (!record) return false;
    if (record.revokedAt === null) record.revokedAt = services.now();
    if (record.sessionId !== null) sessions.delete(record.sessionId);
    return true;
  }

  function revokeSession(sessionId: string): boolean {
    const existed = sessions.delete(sessionId);
    let found = false;
    for (const record of recordsByHash.values()) {
      if (record.sessionId === sessionId) {
        record.revokedAt = record.revokedAt ?? services.now();
        found = true;
      }
    }
    return existed || found;
  }

  function records(): PairingTokenRecord[] {
    return [...recordsByHash.values()].map((record) => ({ ...record }));
  }

  function activeSessions(): number {
    return sessions.size;
  }

  return {
    generate,
    connect,
    authenticateSession,
    touch,
    sweepIdle,
    revoke,
    revokeSession,
    records,
    registerFailure,
    isBlocked,
    clearFailures,
    activeSessions,
    config,
  };
}
