# Subspec F — Slice f-13: Single-Port Bridge Router (43127)

**Source:** `docs/specs/subs/SUBSPEC-F_MCP_ADAPTER.md` F2 (port 43127, configurable), §2.1.1 (authority), §3.1 (connection flow), §4.1 (security), §4.7 (health), §6 (destructive protocol), §7 (export)
**Constraint:** Pure TypeScript in `src/bridge-router.ts` — zero framework/browser/Node/Three.js/MCP imports (requests arrive as plain objects). The `node:http` listener lives in `src/listener.ts` and is the only impure file.
**Research:** `docs/research/subplan-f.md` F-2.1 … F-2.5.
**Fixes:** audit PF-2 (nothing wired) and DOUBTS D-7 (two stub listeners on 8765/8766 vs SPEC-F F2's 43127).

## Goal

One localhost listener on 43127 that serves the health endpoints, answers CORS preflights correctly (including Chrome PNA), authenticates every mutating request with a pairing token, and routes MCP tool calls and exports through the modules already built (f-2, f-7, f-8, f-9, f-10, f-11). Replaces `bridge.ts` (8765) and `health.ts` (8766).

## Files

| File | Action | Content |
|------|--------|---------|
| `apps/mcp-companion/src/bridge-router.ts` | create | `createBridgeRouter`, request/response types, route table, auth + security pipeline |
| `apps/mcp-companion/src/listener.ts` | create | `node:http` + `ws` binding on 127.0.0.1:43127, delegating to the router |
| `apps/mcp-companion/src/bridge.ts` | delete | superseded (port 8765, echo only) |
| `apps/mcp-companion/src/health.ts` | delete | superseded (port 8766, static JSON) |
| `apps/mcp-companion/__tests__/slice-f-13-bridge-router.test.ts` | create | Routing, security pipeline, CORS/PNA, auth, health, tool dispatch |
| `apps/mcp-companion/src/index.ts` | update | re-export the router |

## Request pipeline (every request, in order)

1. **Host validation** (F-2.2) — reject 403 on a missing/foreign `Host` before anything else: this is the DNS-rebinding defence.
2. **Preflight** (`OPTIONS`) — answer via `corsPreflightResponse` (F-2.1/F-2.3); never touch auth.
3. **CORS** for browser requests — a present but non-allowlisted `Origin` is rejected 403.
4. **Rate limiting** — a blocked client is rejected 429 with `RATE_LIMITED`.
5. **Auth** — `/healthz` and `/readyz` are unauthenticated liveness probes; `/metrics`, `/mcp` and `/export` require `Authorization: Bearer <pairing token>`.
6. **Route** — dispatch, then append CORS headers to the response.

## Routes

| Method | Path | Auth | Behaviour |
|--------|------|------|-----------|
| `OPTIONS` | any | no | CORS/PNA preflight |
| `GET` | `/healthz` | no | f-10 `HealthStatus`, 200 |
| `GET` | `/readyz` | no | f-10 readiness, 200/503 |
| `GET` | `/metrics` | yes | f-10 `MetricsReport`, 200 |
| `POST` | `/mcp` | yes | JSON-RPC-ish tool dispatch: `{ tool, projectId, expectedRevision, args, requestId?, dryRun?, confirmationToken? }` |
| `POST` | `/export` | yes | f-8 `exportSchematic`, body base64 decimal-free (`{ projectId, relativePath, format, bytesBase64 }`) |
| any | other | — | 404 |

- Destructive tools (`CONFIRMATION_REQUIRED_TOOLS`) go through f-7's two-phase protocol: a call without `confirmationToken` returns the dry-run preview + token; a call with one applies.
- Non-destructive tools execute immediately and still require `expectedRevision` + `requestId` (§6 rule 3).
- Every mutating call appends an f-9 Agent Log entry; the response carries the entry id and `undoAvailable`.
- Tool failures map through f-11 `classifyFailure`, so the wire carries `{ code, message, currentRevision, suggestedAction }`.

## Acceptance criteria

1. The single port is `COMPANION_PORT` (43127); no other port appears in `src/`.
2. A foreign or missing `Host` ⇒ 403 with no CORS headers, before auth is considered.
3. `OPTIONS` with an allowlisted origin + PNA request ⇒ 204 with the echoed origin, `Vary: Origin` and `Access-Control-Allow-Private-Network: true`; a foreign origin ⇒ 403.
4. A browser request (`Origin` present) from a non-allowlisted origin ⇒ 403 even with a valid token.
5. `/healthz` and `/readyz` need no token; `/metrics` and `/mcp` without a token ⇒ 401.
6. A token minted for project A cannot mutate project B (`PROJECT_MISMATCH`).
7. A blocked client ⇒ 429 before auth is checked.
8. `/mcp` with a destructive tool and no token ⇒ 200 dry-run payload with `confirmationToken` and `requiresConfirmation: true`; applying with it ⇒ 200 with `applied: true` and an incremented revision.
9. `/mcp` with a non-destructive tool executes without a confirmation token.
10. A stale `expectedRevision` ⇒ f-11 `STALE_REVISION` with `currentRevision` on the wire.
11. `/export` writes through f-8 and returns the artifact handle, not the bytes.
12. Every mutating call produces an Agent Log entry with the tool name and revision.
13. Unknown paths ⇒ 404; unknown tools ⇒ 400 `VALIDATION_FAILED`.
14. Response CORS headers are added only for an allowlisted origin, never a wildcard.

## Tests

`apps/mcp-companion/__tests__/slice-f-13-bridge-router.test.ts` — plain request objects, injected doubles for the pairing authority, document, log, exporter and health reporter.

```
cd apps/mcp-companion
node --experimental-strip-types __tests__/slice-f-13-bridge-router.test.ts
```

Result (2026-11-13): 60 assertions, 0 failures. Verified twice: as unit tests, and — for slice f-13 —
end to end over real HTTP on 127.0.0.1:43127 via `apps/mcp-companion/scripts/live-e2e.sh`
(27 checks: liveness, DNS-rebinding refusal, PNA preflight, auth, pair→session, destructive
dry-run→apply, idempotent replay, stale revision, real file export, traversal refusal, 404).

Two bugs the live run caught that the unit doubles could not, both fixed in place:

1. `posixJoin` forced POSIX separators, so a Windows approved root produced `/c:/...`, which
   `node:fs` rejects with ENOENT. It now preserves the root's own form.
2. Approved roots were not canonicalized at configuration time, so a POSIX-shaped root and the
   canonical candidate compared unequal and every export was refused `PATH_SYMLINK_ESCAPE`.

## Verification

- `tsc --noEmit` for `apps/mcp-companion`: exit 0
- `node --experimental-strip-types __tests__/slice-f-13-bridge-router.test.ts`: exit 0
- `bash scripts/live-e2e.sh`: `passed: 27  failed: 0`