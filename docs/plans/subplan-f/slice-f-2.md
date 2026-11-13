# Subspec F — Slice f-2: Pairing Token + Security

**Source:** `docs/specs/subs/SUBSPEC-F_MCP_ADAPTER.md` §2.2.3 (Pairing token security), §2.2.4 (Security: loopback, CORS, PNA, origin validation); F1, F2, F12, F13, F14; §2.6, §3.1, §4.1; §10.2 items 2, 13, 17, 18, 25
**Constraint:** Pure TypeScript, zero framework/browser/Node/Three.js/MCP imports. Imports from `@easyschemedit/domain` via relative paths only; crypto, clock and listeners are injected.
**Research:** `docs/research/subplan-f.md` decisions F-2.1 … F-2.5.
**Second pass (2026-11-13):** the original pass delivered types only (`docs/audits/subplan-f-round-2.md` PF-1). This slice now also delivers the executable lifecycle. The original type names below are kept so no consumer breaks.

## Goal

Implement pairing token security types **and the executable lifecycle**: `PairingToken`, `PairingTokenState`, `SecurityConfig`, `SecurityPolicy`, `ConnectionSecurity`, plus `createPairingAuthority` (256-bit one-time tokens, 5-minute TTL, 30-minute idle timeout, hash-only storage, revocation, rate limiting) and the connection-security checks (loopback, exact-origin CORS, Chrome PNA, DNS-rebinding Host validation) on SPEC-F F2's port.

## Files

| File | Action | Content |
|------|--------|---------|
| `apps/mcp-companion/src/pairing-token.ts` | rewrite | retained types + `createPairingAuthority`, `checkHost`, `checkOrigin`, `corsPreflightResponse`, `classifyAddressSpace` |
| `apps/mcp-companion/__tests__/slice-f-2-pairing-token.test.ts` | create | Token lifecycle, storage, revocation, rate limiting, CORS/PNA/Host checks |
| `apps/mcp-companion/src/index.ts` | update | re-export the authority surface |


## Types / APIs

```ts
export type PairingToken = {
  token: string;              // 256-bit random token (never stored in plaintext)
  tokenHash: string;          // SHA-256 hash of token (stored instead of plaintext)
  projectId: string;          // bound to project
  createdAt: number;          // epoch ms
  ttlMs: number;              // 300000 (5 minutes)
  used: boolean;              // one-time use
  revoked: boolean;           // manually revoked
};

export type PairingTokenState = {
  pendingTokens: Map<string, PairingToken>;   // tokenHash -> token
  usedTokens: Map<string, PairingToken>;      // used token hashes (for replay detection)
  revokedTokens: Set<string>;                 // revoked token hashes
};

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
```

### Added in the second pass (executable lifecycle)

```ts
export const DEFAULT_PAIRING_TOKEN_TTL_MS = 300_000;       // F1
export const DEFAULT_SESSION_IDLE_TIMEOUT_MS = 1_800_000;  // §2.6 (30 minutes)
export const COMPANION_PORT = 43127;                       // SPEC-F F2
export const ALLOWED_HOSTNAMES = ['localhost', '127.0.0.1', '[::1]'];

export type PairingTokenRecord = {
  tokenHash: string;          // SHA-256; the plaintext is never retained
  projectId: string | null;
  createdAt: number;
  expiresAt: number;
  usedAt: number | null;
  revokedAt: number | null;
  sessionId: string | null;
  idleDeadline: number | null;
};

export type ConnectFailure =
  | 'NOT_FOUND' | 'EXPIRED' | 'ALREADY_USED' | 'REVOKED'
  | 'PROJECT_MISMATCH' | 'RATE_LIMITED';

export type ConnectResult =
  | { ok: true; sessionId: string; projectId: string; record: PairingTokenRecord }
  | { ok: false; reason: ConnectFailure };

export type PairingAuthorityServices = {
  randomToken(): string;          // 256-bit CSPRNG hex, injected
  sha256(value: string): string;  // SHA-256 hex, injected
  now(): number;
};

export type PairingAuthority = {
  generate(projectId?: string): { token: string; record: PairingTokenRecord };
  connect(input: { token: string; projectId?: string; clientId?: string }): ConnectResult;
  touch(sessionId: string): boolean;
  sweepIdle(): string[];
  revoke(token: string): boolean;
  revokeSession(sessionId: string): boolean;
  records(): PairingTokenRecord[];
  registerFailure(clientId: string): { blocked: boolean; blockUntil: number | null };
  isBlocked(clientId: string): boolean;
  clearFailures(clientId: string): void;
  activeSessions(): number;
};

export function checkHost(hostHeader: string | undefined, allowed?: string[]): { ok: boolean; hostname?: string; reason?: string };
export function checkOrigin(originHeader: string | undefined, allowedOrigins: string[]): { ok: boolean; origin?: string; browser: boolean; reason?: string };
export function corsPreflightResponse(
  input: { origin?: string; requestedMethod?: string; requestedHeaders?: string; pnaRequested?: boolean },
  policy: CorsPolicy,
): CorsDecision;
export function classifyAddressSpace(address: string): 'public' | 'private' | 'local';
```

Key rules:

- Pairing token: 256-bit random, 5-minute TTL, one-time use
- Plaintext never stored - only SHA-256 hash
- Revocation, expiry, idle timeout supported
- Pairing tokens never exposed in URLs or logs
- Loopback-only binding (127.0.0.1); bridge port 43127 (SPEC-F F2)
- Exact origin allowlist; no wildcard CORS; preflight answered only for allowlisted origins
- DNS rebinding protection by port-agnostic Host hostname allowlist (F-2.2)
- Chrome PNA validation: echo `Access-Control-Allow-Private-Network` only when requested (F-2.1)
- Constant-time comparison over SHA-256 digests (F-2.4)

## Acceptance criteria

Original pass:

1. `PairingToken` has token, tokenHash, projectId, createdAt, ttlMs (300000), used, revoked
2. `PairingTokenState` has pendingTokens, usedTokens, revokedTokens
3. `SecurityConfig` has loopbackOnly, allowedOrigins, corsEnabled, corsAllowCredentials, pnaEnabled, dnsRebindingProtection, maxConnectionAttempts, blockDurationMs
4. `ConnectionSecurity` has connectionId, clientAddress, clientPort, serverAddress, serverPort, connectedAt, lastActivityAt, pairingTokenUsed?, origin?, userAgent?, isSecure
5. `PairingProtocol` has generatePairingToken, hashToken, validateToken, isTokenExpired, isTokenUsed, revokeToken, checkOrigin, checkLoopback, checkPNA
6. Pairing token TTL is 300000ms (5 minutes)
7. Pairing tokens never exposed in URLs or logs
8. SHA-256 hash stored instead of plaintext
9. One-time use - token marked used after first validation

Second pass (executable behaviour; §10.2 items 2, 13, 17, 18, 25):

10. A generated token is 256-bit and the record stores only `tokenHash`; the plaintext appears in no record and `JSON.stringify(records())` cannot contain it.
11. Connect after the 5-minute TTL ⇒ `EXPIRED`, and the record is not consumed.
12. A second connect with the same token ⇒ `ALREADY_USED`.
13. A revoked token ⇒ `REVOKED`; revoking an unknown token returns false.
14. A token minted for `p1` refuses `p2` with `PROJECT_MISMATCH`; a project-less token accepts any project.
15. An unknown token ⇒ `NOT_FOUND`.
16. Rate limiting: 5 failures block the client for 5 minutes; a success clears the counter; a blocked client is refused `RATE_LIMITED` even with a valid token.
17. Idle timeout: 30 minutes of inactivity drops the session; 29 minutes does not; `touch()` refreshes the deadline.
18. `checkHost` accepts `localhost`, `127.0.0.1`, `[::1]` with any port; rejects `evil.com`, `localhost.evil.com`, a missing Host and an unparseable Host.
19. `checkOrigin` accepts only exact allowlist entries; rejects `null`, a differing port and a superstring origin; reports `browser: false` when no Origin header is present.
20. CORS preflight: allowlisted origin ⇒ 204 echoing that origin with `Vary: Origin` and `Access-Control-Allow-Private-Network: true` when requested; disallowed origin ⇒ refused with no CORS headers.
21. No `Origin` header ⇒ no CORS headers issued (non-browser client).
22. `classifyAddressSpace` maps `10/8`, `172.16/12`, `192.168/16`, `169.254/16`, `fc00::/7`, `fe80::/10` to private/local and public addresses to `public`.
23. `COMPANION_PORT` is 43127; the hostname allowlist is exactly the three loopback forms.

## Tests

`apps/mcp-companion/__tests__/slice-f-2-pairing-token.test.ts` — injected generator/hash/clock double, so no crypto and no real time are involved.

```
cd apps/mcp-companion
node --experimental-strip-types __tests__/slice-f-2-pairing-token.test.ts
```

## Verification

- `node <typescript@5.9.3>/bin/tsc --noEmit` for `apps/mcp-companion`: exit 0
- Test command above: exit 0

