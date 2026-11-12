# Subspec F — Slice f-0: MCP Companion Config + Session + Authority Modes

**Source:** `docs/specs/subs/SUBSPEC-F_MCP_ADAPTER.md` §2.1 (Deployment model), §2.1.1 (Document authority modes)
**Constraint:** Pure TypeScript, zero framework/browser/Node/Three.js/MCP imports. Type definitions only.

## Goal

Create MCP companion configuration, session types, and document authority mode types. Define the authority lifecycle: browser-live mode, headless local-file mode, and explicit authority handover.

## Files

| File | Action | Content |
|------|--------|---------|
| `apps/mcp-companion/src/companion-config.ts` | create | `McpCompanionConfig`, `McpSession`, authority type definitions |

## Types / APIs

```ts
export type McpCompanionConfig = {
  port: number;                    // default 43127
  host: string;                    // '127.0.0.1' (loopback only)
  pairingTokenTtlMs: number;        // 300000 (5 minutes)
  confirmationTokenTtlMs: number;   // 60000 (60 seconds)
  maxBlocksPerCall: number;         // 250000
  configurableLimit: number;        // 1000000
  absoluteSafetyLimit: number;      // 5000000
  idempotencyRetentionMs: number;  // 900000 (15 minutes)
  idempotencyMaxEntries: number;    // 1000
  idempotencyMaxBytes: number;     // 50 * 1024 * 1024 (50 MiB)
  approvedDirectories: string[];   // canonicalized absolute paths
  projectRestrictions: Record<string, string[]>;  // projectId → allowed dirs
};

export type McpSession = {
  id: string;
  projectId: string;
  expectedRevision: number;
  connectedAt: string;
  lastActivityAt: string;
  browserConnected: boolean;
  authority: 'browser' | 'companion';   // who owns the document in this session (F9/F12)
};
```

Document authority modes (F9):
- **Browser-live mode:** browser owns document in memory; authority = 'browser'; companion is forwarding proxy only
- **Headless local-file mode:** companion owns document loaded from .vxproj; authority = 'companion'
- **Authority handover:** explicit, atomic, one at a time; browser→companion or companion→browser; both sides acknowledge same target revision

## Acceptance criteria

1. `McpCompanionConfig` has port default 43127, host '127.0.0.1', pairingTokenTtlMs 300000, confirmationTokenTtlMs 60000
2. `maxBlocksPerCall` default 250000, configurableLimit 1000000, absoluteSafetyLimit 5000000
3. `McpSession` has authority: 'browser' | 'companion'
4. Authority modes: browser-live (browser owns doc, companion proxies), headless local-file (companion owns doc), explicit handover
5. Handover is atomic: authority flips from one side to the other, never both, never neither
6. `apps/mcp-companion` imports only from `@easyschemedit/domain` (no framework/browser/Node/Three.js/MCP SDK imports in types)
7. No plaintext pairing token storage — only SHA-256 hash (see f-2)

## Tests

No test file yet — type definitions only. Verification via typecheck. Test file `slice-f-0-companion-config.test.ts` to be created with test harness.

## Verification

- `pnpm --filter @easyschemedit/mcp-companion exec tsc --noEmit` exit code 0
