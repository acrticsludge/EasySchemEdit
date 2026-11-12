// apps/mcp-companion/src/pairing-token.ts
// Pairing token + security types (SUBSPEC-F §2.2.3, §2.2.4).
// Pure TypeScript, zero framework/browser/Node/Three.js/MCP imports.
// Type definitions only; crypto/subtle imported in implementation.

// ============================================================================
// Pairing Token
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
// Pairing Protocol
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

// Default pairing token TTL: 5 minutes (300000ms)
export const DEFAULT_PAIRING_TOKEN_TTL_MS = 300000;

// Default max connection attempts before block
export const DEFAULT_MAX_CONNECTION_ATTEMPTS = 5;

// Default block duration: 5 minutes (300000ms)
export const DEFAULT_BLOCK_DURATION_MS = 300000;

// Loopback addresses
export const LOOPBACK_ADDRESSES: ReadonlySet<string> = new Set([
  '127.0.0.1',
  '::1',
  '0:0:0:0:0:0:0:1',
]);
