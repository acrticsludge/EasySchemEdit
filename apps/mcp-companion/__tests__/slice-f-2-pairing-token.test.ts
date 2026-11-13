// apps/mcp-companion/__tests__/slice-f-2-pairing-token.test.ts
// Slice f-2 tests: pairing token lifecycle + connection security
// (SUBSPEC-F F1, F2, F12, F13, F14; §2.6, §3.1, §4.1; §10.2 items 2, 13, 17, 18, 25).
// Run: node --experimental-strip-types __tests__/slice-f-2-pairing-token.test.ts
// Pure TypeScript, no test framework — same assert harness as the other f-slices.
// Crypto, clock and the token generator are injected, so no real crypto or wall clock is used.

import {
  createPairingAuthority,
  checkHost,
  checkOrigin,
  corsPreflightResponse,
  classifyAddressSpace,
  DEFAULT_PAIRING_TOKEN_TTL_MS,
  DEFAULT_SESSION_IDLE_TIMEOUT_MS,
  DEFAULT_MAX_CONNECTION_ATTEMPTS,
  DEFAULT_BLOCK_DURATION_MS,
  COMPANION_PORT,
  ALLOWED_HOSTNAMES,
  type PairingAuthorityServices,
} from '../src/pairing-token.ts';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: ${message}`);
  }
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual === expected) {
    passed++;
  } else {
    failed++;
    console.error(
      `FAIL: ${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

// ── Doubles ────────────────────────────────────────────────────────────────

let clock = 10_000_000;
let tokenSeq = 0;

/** Deterministic 64-hex-char (256-bit) "random" token, and a stable non-crypto digest stand-in. */
function makeServices(): PairingAuthorityServices {
  return {
    now: () => clock,
    randomToken: () => `${(++tokenSeq).toString(16).padStart(2, '0').repeat(32)}`,
    sha256: (value: string) => {
      // Deterministic 64-hex-char digest stand-in. Not cryptographic; the authority only needs a
      // stable one-way-looking mapping, and real SHA-256 is wired in production.
      let h1 = 0x811c9dc5;
      let h2 = 0x1000193;
      for (let i = 0; i < value.length; i++) {
        h1 = Math.imul(h1 ^ value.charCodeAt(i), 0x01000193) >>> 0;
        h2 = Math.imul(h2 + value.charCodeAt(i) + i, 0x85ebca6b) >>> 0;
      }
      const part = (n: number) => n.toString(16).padStart(8, '0');
      return `${part(h1)}${part(h2)}${part(h1 ^ h2)}${part(h1 + h2)}`.repeat(2);
    },
  };
}

function makeAuthority(options?: {
  allowedOrigins?: string[];
  maxAttempts?: number;
  blockDurationMs?: number;
  idleTimeoutMs?: number;
}) {
  let sessionSeq = 0;
  return createPairingAuthority({
    services: makeServices(),
    allowedOrigins: options?.allowedOrigins ?? ['http://localhost:5173'],
    maxConnectionAttempts: options?.maxAttempts,
    blockDurationMs: options?.blockDurationMs,
    idleTimeoutMs: options?.idleTimeoutMs,
    generateSessionId: () => `session-${++sessionSeq}`,
  });
}

console.log('--- Slice f-2: constants (F1, F2, §2.6) ---');

{
  assertEqual(DEFAULT_PAIRING_TOKEN_TTL_MS, 300_000, 'f-2.6: token TTL is 300000ms (5 minutes)');
  assertEqual(DEFAULT_SESSION_IDLE_TIMEOUT_MS, 1_800_000, 'f-2.17: idle timeout is 30 minutes');
  assertEqual(COMPANION_PORT, 43127, 'f-2.23: companion port is 43127 (SPEC-F F2)');
  assertEqual(ALLOWED_HOSTNAMES.length, 3, 'f-2.23: three allowed hostnames');
  assertEqual(ALLOWED_HOSTNAMES.join(','), 'localhost,127.0.0.1,[::1]', 'f-2.23: allowlist is localhost, 127.0.0.1, [::1]');
  assertEqual(DEFAULT_MAX_CONNECTION_ATTEMPTS, 5, 'f-2.16: five attempts before a block');
  assertEqual(DEFAULT_BLOCK_DURATION_MS, 300_000, 'f-2.16: block lasts 5 minutes');
}

console.log('--- Slice f-2: token generation and storage (F12, F14) ---');

{
  const auth = makeAuthority();
  const { token, record } = auth.generate('p1');

  assertEqual(token.length, 64, 'f-2.10: token is 256-bit (64 hex chars)');
  assertEqual(/^[0-9a-f]{64}$/.test(token), true, 'f-2.10: token is lowercase hex');
  assertEqual(record.tokenHash.length, 64, 'f-2.10: the stored hash is SHA-256 sized');
  assertEqual(record.tokenHash === token, false, 'f-2.8: the stored value is not the plaintext');
  assertEqual(record.projectId, 'p1', 'f-2.10: the record is bound to the project');
  assertEqual(record.expiresAt - record.createdAt, 300_000, 'f-2.6: the record carries the 5-minute TTL');
  assertEqual(record.usedAt, null, 'f-2.10: a fresh record is unused');
  assertEqual(record.revokedAt, null, 'f-2.10: a fresh record is not revoked');
  assertEqual(record.sessionId, null, 'f-2.10: a fresh record has no session');

  // F14: the plaintext must not appear anywhere in the retained state.
  const serialized = JSON.stringify(auth.records());
  assertEqual(serialized.includes(token), false, 'f-2.7: the plaintext never appears in the retained records');
  assertEqual(serialized.includes(record.tokenHash), true, 'f-2.8: only the hash is retained');

  // Two tokens must not collide.
  const second = auth.generate('p1');
  assert(second.token !== token, 'f-2.10: generated tokens are distinct');
  assertEqual(auth.records().length, 2, 'f-2.10: both records are retained');
}

console.log('--- Slice f-2: connect lifecycle (§3.1) ---');

{
  const auth = makeAuthority();
  const { token } = auth.generate('p1');
  const result = auth.connect({ token, projectId: 'p1' });

  assertEqual(result.ok, true, 'f-2.10: a valid token connects');
  if (result.ok) {
    assertEqual(result.projectId, 'p1', 'f-2.10: the session carries the bound project');
    assertEqual(result.sessionId, 'session-1', 'f-2.10: a session id is minted');
  }
  assertEqual(auth.activeSessions(), 1, 'f-2.10: the session is active');

  // One-time use (F1): the same token cannot connect twice.
  const again = auth.connect({ token, projectId: 'p1' });
  assertEqual(again.ok, false, 'f-2.9: a token is one-time use');
  assert(again.ok === false && again.reason === 'ALREADY_USED', 'f-2.12: reuse reports ALREADY_USED');

  const unknown = auth.connect({ token: 'f'.repeat(64), projectId: 'p1' });
  assert(unknown.ok === false && unknown.reason === 'NOT_FOUND', 'f-2.15: an unknown token reports NOT_FOUND');
}

console.log('--- Slice f-2: expiry (§2.6) ---');

{
  const auth = makeAuthority();
  const { token } = auth.generate('p1');

  clock += DEFAULT_PAIRING_TOKEN_TTL_MS - 1;
  const justInTime = auth.connect({ token, projectId: 'p1' });
  assertEqual(justInTime.ok, true, 'f-2.11: a token inside its TTL connects');

  const auth2 = makeAuthority();
  const t2 = auth2.generate('p1').token;
  clock += DEFAULT_PAIRING_TOKEN_TTL_MS + 1;
  const expired = auth2.connect({ token: t2, projectId: 'p1' });
  assert(expired.ok === false && expired.reason === 'EXPIRED', 'f-2.11: a token past its TTL reports EXPIRED');

  // An expired token must not be consumed — the caller can request a fresh one.
  const record = auth2.records()[0];
  assertEqual(record.usedAt, null, 'f-2.11: expiry does not consume the record');
}

console.log('--- Slice f-2: revocation (F12) ---');

{
  const auth = makeAuthority();
  const { token } = auth.generate('p1');
  assertEqual(auth.revoke(token), true, 'f-2.13: revoking a known token succeeds');
  const revoked = auth.connect({ token, projectId: 'p1' });
  assert(revoked.ok === false && revoked.reason === 'REVOKED', 'f-2.13: a revoked token reports REVOKED');
  assertEqual(auth.revoke('f'.repeat(64)), false, 'f-2.13: revoking an unknown token returns false');

  // revokeSession drops a live session and invalidates its token.
  const auth2 = makeAuthority();
  const minted = auth2.generate('p1');
  const conn = auth2.connect({ token: minted.token, projectId: 'p1' });
  assertEqual(conn.ok, true, 'f-2.13: session connects before revocation');
  if (conn.ok) {
    assertEqual(auth2.revokeSession(conn.sessionId), true, 'f-2.13: revokeSession succeeds');
  }
  assertEqual(auth2.activeSessions(), 0, 'f-2.13: the session is no longer active');
  const afterRevoke = auth2.connect({ token: minted.token, projectId: 'p1' });
  assert(afterRevoke.ok === false, 'f-2.13: a session-revoked token cannot reconnect');
}

console.log('--- Slice f-2: project binding ---');

{
  const auth = makeAuthority();
  const { token } = auth.generate('p1');
  const wrong = auth.connect({ token, projectId: 'p2' });
  assert(wrong.ok === false && wrong.reason === 'PROJECT_MISMATCH', 'f-2.14: a bound token refuses another project');

  // The mismatch must not consume the token.
  const right = auth.connect({ token, projectId: 'p1' });
  assertEqual(right.ok, true, 'f-2.14: the token still works for its own project');

  // A project-less token accepts any project (headless use).
  const auth2 = makeAuthority();
  const anyToken = auth2.generate();
  const anyProject = auth2.connect({ token: anyToken.token, projectId: 'whatever' });
  assertEqual(anyProject.ok, true, 'f-2.14: a project-less token accepts any project');
}

console.log('--- Slice f-2: rate limiting (§4.1) ---');

{
  const auth = makeAuthority();

  for (let i = 0; i < DEFAULT_MAX_CONNECTION_ATTEMPTS - 1; i++) {
    const r = auth.registerFailure('client-1');
    assertEqual(r.blocked, false, `f-2.16: failure ${i + 1} does not block`);
  }
  const fifth = auth.registerFailure('client-1');
  assertEqual(fifth.blocked, true, 'f-2.16: the fifth failure blocks the client');
  assertEqual(fifth.blockUntil, clock + DEFAULT_BLOCK_DURATION_MS, 'f-2.16: the block lasts 5 minutes');
  assertEqual(auth.isBlocked('client-1'), true, 'f-2.16: the client is blocked');

  // A blocked client is refused even with a valid token.
  const { token } = auth.generate('p1');
  const refused = auth.connect({ token, projectId: 'p1', clientId: 'client-1' });
  assert(refused.ok === false && refused.reason === 'RATE_LIMITED', 'f-2.16: a blocked client is RATE_LIMITED');

  // Another client is unaffected.
  const other = auth.connect({ token, projectId: 'p1', clientId: 'client-2' });
  assertEqual(other.ok, true, 'f-2.16: the block is per client');

  // The block expires.
  clock += DEFAULT_BLOCK_DURATION_MS + 1;
  assertEqual(auth.isBlocked('client-1'), false, 'f-2.16: the block expires after its duration');

  // A successful connect clears the counter.
  const auth2 = makeAuthority();
  auth2.registerFailure('c');
  auth2.registerFailure('c');
  const t = auth2.generate('p1').token;
  assertEqual(auth2.connect({ token: t, projectId: 'p1', clientId: 'c' }).ok, true, 'f-2.16: connect succeeds below the limit');
  assertEqual(auth2.isBlocked('c'), false, 'f-2.16: a success clears the failure counter');
  for (let i = 0; i < DEFAULT_MAX_CONNECTION_ATTEMPTS; i++) auth2.registerFailure('c');
  assertEqual(auth2.isBlocked('c'), true, 'f-2.16: failures accumulate again after the reset');
  auth2.clearFailures('c');
  assertEqual(auth2.isBlocked('c'), false, 'f-2.16: clearFailures lifts the block');
}

console.log('--- Slice f-2: idle timeout (F12) ---');

{
  const auth = makeAuthority();
  const { token } = auth.generate('p1');
  const conn = auth.connect({ token, projectId: 'p1' });
  assertEqual(conn.ok, true, 'f-2.17: session established');
  const sessionId = conn.ok ? conn.sessionId : '';

  clock += DEFAULT_SESSION_IDLE_TIMEOUT_MS - 60_000;
  assertEqual(auth.sweepIdle().length, 0, 'f-2.17: 29 minutes idle does not drop the session');
  assertEqual(auth.activeSessions(), 1, 'f-2.17: the session is still active');

  assertEqual(auth.touch(sessionId), true, 'f-2.17: touch refreshes a live session');
  clock += DEFAULT_SESSION_IDLE_TIMEOUT_MS - 60_000;
  assertEqual(auth.sweepIdle().length, 0, 'f-2.17: touch extended the idle deadline');

  clock += 60_001;
  const dropped = auth.sweepIdle();
  assertEqual(dropped.length, 1, 'f-2.17: 30 minutes of inactivity drops the session');
  assertEqual(dropped[0], sessionId, 'f-2.17: the dropped session is reported');
  assertEqual(auth.activeSessions(), 0, 'f-2.17: the session count drops');
  assertEqual(auth.touch(sessionId), false, 'f-2.17: a dropped session cannot be touched');
}

console.log('--- Slice f-2: Host header validation (F13 / F-2.2) ---');

{
  assertEqual(checkHost('localhost:43127').ok, true, 'f-2.18: localhost with a port is accepted');
  assertEqual(checkHost('127.0.0.1:43127').ok, true, 'f-2.18: 127.0.0.1 with a port is accepted');
  assertEqual(checkHost('127.0.0.1').ok, true, 'f-2.18: a bare loopback host is accepted');
  assertEqual(checkHost('[::1]:43127').ok, true, 'f-2.18: bracketed IPv6 loopback is accepted');
  assertEqual(checkHost('localhost').ok, true, 'f-2.18: bare localhost is accepted');

  assertEqual(checkHost('evil.com').ok, false, 'f-2.18: a foreign host is rejected');
  assertEqual(checkHost('evil.com:43127').ok, false, 'f-2.18: a foreign host with a port is rejected');
  assertEqual(checkHost('localhost.evil.com').ok, false, 'f-2.18: a suffix-spoofed host is rejected');
  assertEqual(checkHost('127.0.0.1.evil.com').ok, false, 'f-2.18: a spoofed loopback host is rejected');
  assertEqual(checkHost(undefined).ok, false, 'f-2.18: a missing Host is rejected');
  assertEqual(checkHost('').ok, false, 'f-2.18: an empty Host is rejected');
  assertEqual(checkHost('http://localhost:43127').ok, false, 'f-2.18: a URL-shaped Host is rejected');

  // Port-agnostic: the port must not matter.
  const a = checkHost('localhost:1');
  const b = checkHost('localhost:65535');
  assertEqual(a.ok && b.ok, true, 'f-2.18: validation is port-agnostic');
}

console.log('--- Slice f-2: Origin validation (F-2.3) ---');

{
  const allowed = ['http://localhost:5173', 'https://app.easyschemedit.test'];

  assertEqual(checkOrigin('http://localhost:5173', allowed).ok, true, 'f-2.19: an exact allowlisted origin passes');
  assertEqual(checkOrigin('https://app.easyschemedit.test', allowed).ok, true, 'f-2.19: a second allowlisted origin passes');
  assertEqual(checkOrigin('http://localhost:5174', allowed).ok, false, 'f-2.19: a differing port is rejected');
  assertEqual(checkOrigin('https://localhost:5173', allowed).ok, false, 'f-2.19: a differing scheme is rejected');
  assertEqual(checkOrigin('http://localhost:5173.evil.com', allowed).ok, false, 'f-2.19: a superstring origin is rejected');
  assertEqual(checkOrigin('http://evil.com', allowed).ok, false, 'f-2.19: an unrelated origin is rejected');
  assertEqual(checkOrigin('null', allowed).ok, false, 'f-2.19: the "null" origin is rejected');

  const none = checkOrigin(undefined, allowed);
  assertEqual(none.browser, false, 'f-2.21: a missing Origin means a non-browser client');
  assertEqual(none.ok, true, 'f-2.21: a non-browser client is not rejected by origin policy');

  const present = checkOrigin('http://localhost:5173', allowed);
  assertEqual(present.browser, true, 'f-2.19: a present Origin is identified as a browser');
}

console.log('--- Slice f-2: CORS preflight + PNA (F-2.1, F-2.3) ---');

{
  const policy = {
    allowedOrigins: ['http://localhost:5173'],
    allowedMethods: ['POST', 'OPTIONS'],
    allowedHeaders: ['content-type', 'authorization'],
  };

  const ok = corsPreflightResponse(
    { origin: 'http://localhost:5173', requestedMethod: 'POST', requestedHeaders: 'content-type', pnaRequested: true },
    policy,
  );
  assertEqual(ok.allowed, true, 'f-2.20: an allowlisted preflight is allowed');
  assertEqual(ok.status, 204, 'f-2.20: an allowed preflight answers 204');
  assertEqual(ok.headers['Access-Control-Allow-Origin'], 'http://localhost:5173', 'f-2.20: the exact origin is echoed (no wildcard)');
  assertEqual(ok.headers['Vary'], 'Origin', 'f-2.20: Vary: Origin is set');
  assertEqual(ok.headers['Access-Control-Allow-Private-Network'], 'true', 'f-2.20: PNA is granted when requested');
  assertEqual(ok.headers['Access-Control-Allow-Methods'].includes('POST'), true, 'f-2.20: allowed methods are echoed');

  // PNA is not granted when it was not requested.
  const noPna = corsPreflightResponse(
    { origin: 'http://localhost:5173', requestedMethod: 'POST', pnaRequested: false },
    policy,
  );
  assertEqual('Access-Control-Allow-Private-Network' in noPna.headers, false, 'f-2.20: PNA is not granted unless requested');

  // A non-allowlisted origin is refused with no CORS headers.
  const bad = corsPreflightResponse(
    { origin: 'http://evil.com', requestedMethod: 'POST', pnaRequested: true },
    policy,
  );
  assertEqual(bad.allowed, false, 'f-2.20: a foreign origin preflight is refused');
  assertEqual(Object.keys(bad.headers).length, 0, 'f-2.20: a refused preflight issues no CORS headers');

  // A wildcard must never be emitted.
  for (const origin of ['http://localhost:5173', 'http://evil.com']) {
    const decision = corsPreflightResponse({ origin, requestedMethod: 'POST' }, policy);
    assert(
      (decision.headers['Access-Control-Allow-Origin'] ?? '') !== '*',
      'f-2.20: no wildcard origin is ever emitted',
    );
  }

  // A method outside the allowlist is refused.
  const badMethod = corsPreflightResponse(
    { origin: 'http://localhost:5173', requestedMethod: 'DELETE' },
    policy,
  );
  assertEqual(badMethod.allowed, false, 'f-2.20: a disallowed method is refused');

  // No Origin at all: the preflight is refused (a preflight is browser-only by definition).
  const noOrigin = corsPreflightResponse({ requestedMethod: 'POST' }, policy);
  assertEqual(noOrigin.allowed, false, 'f-2.21: a preflight without an Origin is refused');

  // The origin allowlist for the authority is honoured the same way.
  const strict = makeAuthority({ allowedOrigins: ['http://localhost:5173'] });
  const { token } = strict.generate('p1');
  const fromBadOrigin = strict.connect({ token, projectId: 'p1' });
  assertEqual(fromBadOrigin.ok, true, 'f-2.20: origin policy is enforced at the HTTP layer, not the token layer');
}

console.log('--- Slice f-2: address space classification (F-2.1 / PNA) ---');

{
  assertEqual(classifyAddressSpace('127.0.0.1'), 'local', 'f-2.22: 127.0.0.1 is local');
  assertEqual(classifyAddressSpace('::1'), 'local', 'f-2.22: ::1 is local');
  assertEqual(classifyAddressSpace('10.0.0.5'), 'private', 'f-2.22: 10/8 is private');
  assertEqual(classifyAddressSpace('172.16.4.4'), 'private', 'f-2.22: 172.16/12 is private');
  assertEqual(classifyAddressSpace('192.168.1.1'), 'private', 'f-2.22: 192.168/16 is private');
  assertEqual(classifyAddressSpace('169.254.10.10'), 'private', 'f-2.22: 169.254/16 link-local is private');
  assertEqual(classifyAddressSpace('fc00::1'), 'private', 'f-2.22: fc00::/7 is private');
  assertEqual(classifyAddressSpace('fe80::1'), 'private', 'f-2.22: fe80::/10 is private');
  assertEqual(classifyAddressSpace('8.8.8.8'), 'public', 'f-2.22: a public IPv4 is public');
  assertEqual(classifyAddressSpace('172.32.0.1'), 'public', 'f-2.22: 172.32 is outside 172.16/12');
  assertEqual(classifyAddressSpace('2606:4700::1111'), 'public', 'f-2.22: a public IPv6 is public');
}

console.log('\n=== Slice f-2 Test Summary ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
  process.exit(1);
}
