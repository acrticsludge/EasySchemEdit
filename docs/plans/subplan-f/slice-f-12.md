# Subspec F — Slice f-12: Acceptance Criteria Verification

**Source:** `docs/specs/subs/SUBSPEC-F_MCP_ADAPTER.md` §10.1 (MCP tests), §10.2 (25 acceptance items)
**Constraint:** Pure TypeScript, zero framework/browser/Node/Three.js/MCP imports.
**Depends on:** slices f-0 … f-11.

## Goal

Produce the SPEC-F acceptance harness: one entry per §10.2 item, each either backed by a real in-process assertion or explicitly BLOCKED with the missing dependency named. A BLOCKED item is never reported green (GOAL.md §FIXTURES AND EVIDENCE).

## Files

| File | Action | Content |
|------|--------|---------|
| `apps/mcp-companion/__tests__/slice-f-12-acceptance.test.ts` | create | 25 §10.2 items, real assertions for implemented surfaces, explicit BLOCKED registry |
| `apps/mcp-companion/package.json` | update | `test` runs the whole f-suite including the acceptance harness |

## Status model

Every item resolves to one of:

- **PASS** — an in-process assertion ran and held.
- **BLOCKED** — the behaviour needs something this slice cannot supply (a live paired session, the browser UI, IndexedDB persistence, the MCP SDK transport, real Minecraft fixtures, a native file handle). The missing dependency is named in `blockedBy`.

The harness exits non-zero if any PASS-row assertion fails. BLOCKED rows do not fail the run and are counted and listed, so the traceability table cannot silently drift.

## §10.2 traceability as executed

| # | Acceptance item | Status | Backed by | Blocked by |
|---|-----------------|--------|-----------|------------|
| 1 | Local companion is authority for live connected session | BLOCKED | `companion-config.ts` types + f-10 readiness gate | live paired-session harness |
| 2 | Browser connects over localhost with pairing token (256-bit, 5-min, one-time) | BLOCKED | `pairing-token.ts` types/constants | f-2 token implementation (types only) |
| 3 | MCP and UI send commands to same in-process command bus | BLOCKED | none | shared command-bus wiring + UI |
| 4 | Companion emits document revision events to UI | BLOCKED | none | bridge + UI wiring |
| 5 | All mutating tools accept `MutationEnvelope` | PASS (partial) | f-7 protocol consumes `requestId` + `expectedRevision` | full tool-surface wiring |
| 6 | Destructive operations default to dry-run with confirmation token | PASS | f-7 | — |
| 7 | Confirmation token: 60s TTL, one-time, bound to project+revision+operation+args | PASS | f-7 | — |
| 8 | `maxBlocksPerCall`: 250,000 / 1,000,000 configurable / 5,000,000 absolute | PASS | f-11 | — |
| 9 | Duplicate `requestId` replays; ordering auth → identity → cache → revision | PASS | f-7 | — |
| 10 | Idempotency results persisted atomically with commits | BLOCKED | f-7 in-memory cache | IndexedDB + persistence wiring |
| 11 | Agent Log sanitizes tokens, paths, usernames, secrets, raw NBT, raw file contents | PASS | f-9 | — |
| 12 | Path sandboxing: approved dirs, symlink resolution, traversal blocked, atomic writes | PASS (partial) | f-8 | O_NOFOLLOW race re-check (D-4) |
| 13 | Loopback-only binding, origin allowlist, DNS rebinding protection, PNA | BLOCKED | f-10 `isLocalAddress` | server/bridge implementation |
| 14 | Same command produces same result through UI and MCP | BLOCKED | none | UI + live session |
| 15 | Browser and MCP use same command/query implementation | BLOCKED | none | shared command bus |
| 16 | Single document authority: browser-live or headless, no split-brain | BLOCKED | `DocumentAuthority` type + f-10 gate | session lifecycle implementation |
| 17 | Pairing token: plaintext never stored, SHA-256 only, revocation, expiry, idle timeout | BLOCKED | `pairing-token.ts` types | f-2 implementation |
| 18 | Never expose pairing tokens in URLs or logs | PASS (partial) | f-9 redaction of `ct-`/bearer/token keys | URL handling in the bridge |
| 19 | Candidate-cell, runtime, memory limits alongside changed-block limits | PASS | f-11 | — |
| 20 | Complete Zod schemas for every MCP tool | BLOCKED | `server.ts` declares 4 schemas | ~40-tool schema surface |
| 21 | Operation diff vs revision diff clarified | BLOCKED | `tools/history.ts` types | requires project history data |
| 22 | Operations classified: confirmation-required vs immediate | PASS | f-7 | — |
| 23 | One-click undo only when the operation is the latest undoable action | PASS | f-9 | — |
| 24 | Bounded Agent Log serialization (10,000 entries, 50 MiB); malicious metadata protection | PASS | f-9 | — |
| 25 | Chrome PNA, CORS, preflight, WebSocket, production-origin validated in Phase 0 | BLOCKED | none | Phase-0 browser validation |

Executed totals are printed by the harness and recorded below under Verification.

## Verification

```
cd apps/mcp-companion
node --experimental-strip-types __tests__/slice-f-12-acceptance.test.ts
```

Result (2026-11-13), exit 0:

```
Items: 25  PASS: 12  BLOCKED: 13
Assertions passed: 54   failed: 0   blocked items declared: 13
```

PASS (12): items 5, 6, 7, 8, 9, 11, 12, 18, 19, 22, 23, 24.
BLOCKED (13): items 1, 2, 3, 4, 10, 13, 14, 15, 16, 17, 20, 21, 25 — each listed by the harness alongside the dependency that unblocks it.

The harness exits non-zero if any PASS-row assertion fails or if the traceability set does not cover all 25 items, so neither the assertions nor the coverage can drift silently.
