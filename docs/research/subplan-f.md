# Research Gate: Subplan-F (MCP Adapter)

**Source:** `docs/specs/subs/SUBSPEC-F_MCP_ADAPTER.md` (locked decisions F1–F15)
**Goal:** Local MCP companion server, stdio + localhost bridge, pairing token security, mutation envelope, dry-run/confirmation, idempotency, agent log, health endpoints.

## Research questions

| # | Question | Primary source | Status |
|---|----------|----------------|--------|
| F-1 | @modelcontextprotocol/sdk: stdio server API, tool registration, input schemas with Zod | MCP SDK docs | Pending |
| F-2 | Chrome Private Network Access: PNA preflight, Access-Control-Request-Private-Network | Chrome PNA docs | Pending |
| F-3 | WebSocket over localhost: origin validation, upgrade handshake | WebSocket spec | Pending |
| F-4 | Zod input/output schemas for every MCP tool | Zod docs | Pending |
| F-5 | 256-bit pairing token: crypto.randomBytes(32), SHA-256 hash storage | Node crypto API | Pending |

## Decisions (to fill after research)

| # | Decision | Evidence | Rejected options |
|---|----------|----------|------------------|
| F-1 | Companion binds to 127.0.0.1:43127 (loopback only) | SUBSPEC-F F2 | All interfaces (rejected: security) |
| F-2 | Pairing token: 256-bit, 5-minute TTL, one-time use, SHA-256 hash stored | SUBSPEC-F F1 | Plaintext storage (rejected: F12, F14) |
| F-3 | Confirmation token: 60-second TTL, one-time use, bound to project+revision+operation+args | SUBSPEC-F F5 | No confirmation (rejected: destructive ops need safety) |
| F-4 | Idempotency: 15-minute retention, 1,000 entries, 50 MiB, same DB transaction as document commit | SUBSPEC-F F6, §2.3.8 | Separate idempotency store (rejected: atomic commit) |
| F-5 | Single document authority: browser-live or headless local-file | SUBSPEC-F F9 | Shared authority (rejected: no split-brain) |

## Open questions → DOUBTS.md

None yet.
