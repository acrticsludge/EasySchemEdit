# Subspec H — Slice h-3: MCP Companion Package

**Source:** `docs/specs/subs/SUBSPEC-H_ARCH_PHASES_RELEASE.md` §1 H13, §4.4 (Local MCP companion), §3.2 (MCP companion flow)
**Constraint:** Locally installed Node companion via free GitHub Releases or public npm; loopback-only binding; no paid distribution channel.

## Goal

Create the `apps/mcp-companion/` Node package: an MCP stdio server (`@modelcontextprotocol/sdk` v2) with a localhost HTTP/WebSocket bridge for browser editor connection. Shared command bus with the UI — no MCP-only operation implementations.

## Files to create/modify

| File | Action | Content |
|------|--------|---------|
| `apps/mcp-companion/package.json` | create | `@modelcontextprotocol/sdk` v2, `ws` for WebSocket, `zod` for input schemas |
| `apps/mcp-companion/src/server.ts` | create | MCP stdio server with tool definitions (get_placement, get_origin, detect_conflicts, etc.) |
| `apps/mcp-companion/src/bridge.ts` | create | localhost HTTP + WebSocket bridge for browser connection |
| `apps/mcp-companion/src/health.ts` | create | `/healthz`, `/readyz`, `/metrics` endpoints |
| `apps/mcp-companion/tsconfig.json` | create | TypeScript config |

## Types / APIs

MCP tools call the same command/query API as the UI (shared domain model). No MCP-only operation implementations.

Tool envelope requires: `expectedRevision`, `requestId` (idempotency), and for destructive ops `dryRun` + `confirmationToken`.

## Acceptance criteria

1. `pnpm install` resolves `@easyschemedit/mcp-companion` workspace package
2. MCP stdio server starts and lists tools
3. Health endpoints respond (`/healthz`, `/readyz`, `/metrics`)
4. WebSocket bridge accepts browser connections on loopback only
5. `packages/domain` and `packages/formats` still compile clean (no regressions)

## Tests

No new test file. Verification is via starting the MCP server and hitting health endpoints.

## Verification

- `pnpm install` (from root, now includes `apps/mcp-companion`)
- `cd apps/mcp-companion && pnpm exec tsc --noEmit` exit code 0
- MCP server lists tools without error
- Health endpoint returns 200
