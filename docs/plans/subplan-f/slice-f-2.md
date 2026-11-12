# Subspec F — Slice f-2: Pairing Token + Security

**Source:** `docs/specs/subs/SUBSPEC-F_MCP_ADAPTER.md` §2.2.3 (Pairing token security), §2.2.4 (Security: loopback, CORS, PNA, origin validation)
**Constraint:** Pure TypeScript, zero framework/browser/Node/Three.js/MCP imports. Imports from `@easyschemedit/domain` via relative paths only.

## Goal

Implement pairing token security types: PairingToken, PairingTokenState, SecurityConfig, SecurityPolicy, ConnectionSecurity. These are pure type definitions for pairing token management, loopback binding, CORS, PNA (Private Network Access), and origin validation.

## Files

| File | Action | Content |
|------|--------|---------|
| `apps/mcp-companion/src/pairing-token.ts` | create | `PairingToken`, `PairingTokenState`, `SecurityConfig`, `SecurityPolicy`, `ConnectionSecurity`, `PairingProtocol` types |

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

Key rules:
- Pairing token: 256-bit random, 5-minute TTL, one-time use
- Plaintext never stored - only SHA-256 hash
- Revocation, expiry, idle timeout supported
- Pairing tokens never exposed in URLs or logs
- Loopback-only binding (127.0.0.1)
- Exact origin allowlist
- DNS rebinding protection
- Chrome PNA validation

## Acceptance criteria

1. `PairingToken` has token, tokenHash, projectId, createdAt, ttlMs (300000), used, revoked
2. `PairingTokenState` has pendingTokens, usedTokens, revokedTokens
3. `SecurityConfig` has loopbackOnly, allowedOrigins, corsEnabled, corsAllowCredentials, pnaEnabled, dnsRebindingProtection, maxConnectionAttempts, blockDurationMs
4. `ConnectionSecurity` has connectionId, clientAddress, clientPort, serverAddress, serverPort, connectedAt, lastActivityAt, pairingTokenUsed?, origin?, userAgent?, isSecure
5. `PairingProtocol` has generatePairingToken, hashToken, validateToken, isTokenExpired, isTokenUsed, revokeToken, checkOrigin, checkLoopback, checkPNA
6. Pairing token TTL is 300000ms (5 minutes)
7. Pairing tokens never exposed in URLs or logs
8. SHA-256 hash stored instead of plaintext
9. One-time use - token marked used after first validation

## Tests

No test file yet — type definitions only. Verification via typecheck. Test file `slice-f-2-pairing-token.test.ts` to be created with test harness.

## Verification

- TypeScript compiles clean for `apps/mcp-companion`
