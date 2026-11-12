# Subspec F — MCP Adapter: Slice Plan

**Source:** `docs/specs/subs/SUBSPEC-F_MCP_ADAPTER.md` (locked decisions F1–F15)
**Constraint:** Pure TypeScript, zero framework/browser/Node/Three.js/MCP imports in `@easyschemedit/mcp-companion`. Type definitions only; MCP SDK imported in implementation.

## Method

Build in thin vertical slices per the incremental-implementation skill:
- Implement → Test → Verify → Commit → Next slice
- Each slice changes one logical thing
- Project must build and existing tests pass after each increment

## Slices (one consistent list)

| Slice | Focus | Deliverable | Tests |
|-------|-------|-------------|-------|
| `slice-f-0.md` | MCP companion config + session + authority modes | `apps/mcp-companion/src/companion-config.ts` | Config defaults, authority mode transitions |
| `slice-f-1.md` | Mutation envelope + dry-run result + confirmation token | `apps/mcp-companion/src/mutation-envelope.ts` | Envelope validation, dry-run computation |
| `slice-f-2.md` | Pairing token + security (loopback, CORS, PNA, origin validation) | `apps/mcp-companion/src/pairing-token.ts` | Token hash, TTL, one-time use, revocation |
| `slice-f-3.md` | MCP tool surface: read tools | `apps/mcp-companion/src/tools/read.ts` | list_projects, open_project, get_project_info, list_placements, get_placement, get_origin, detect_conflicts, get_conflict_map, get_material_list, get_selection, get_color_mode, get_history, get_diagnostics |
| `slice-f-4.md` | MCP tool surface: placement tools | `apps/mcp-companion/src/tools/placement.ts` | load_schematic, transform_placement, transform_placements, set_placement_visibility, set_placement_lock, rename_placement, delete_placement, duplicate_placement, set_origin, bake_placements |
| `slice-f-5.md` | MCP tool surface: selection + region tools | `apps/mcp-companion/src/tools/region.ts` | create_selection, clear_selection, select_placements, fill_selection, replace_selection, delete_selection, copy_selection, cut_selection, paste_clipboard, hollow_selection, walls_selection, move_selection |
| `slice-f-6.md` | MCP tool surface: history/export tools | `apps/mcp-companion/src/tools/history.ts` | undo, redo, export_schematic, get_operation_diff, set_color_mode |
| `slice-f-7.md` | Destructive operation protocol: dry-run + apply | `apps/mcp-companion/src/destructive-protocol.ts` | Two-phase dry-run/apply, confirmation token validation |
| `slice-f-8.md` | Export through MCP: write to approved workspace, artifact handle | `apps/mcp-companion/src/mcp-export.ts` | Approved workspace, safe relative path, bounded resource |
| `slice-f-9.md` | Agent log entry + sanitization | `apps/mcp-companion/src/agent-log.ts` | Sanitize tokens, paths, usernames, secrets, raw NBT, raw file contents |
| `slice-f-10.md` | Health endpoint: /healthz, /readyz, /metrics | `apps/mcp-companion/src/health.ts` | Health status, bridge status, uptime |
| `slice-f-11.md` | Failure handling: error codes, stale revision, duplicate requestId, over-limit, locked placement | `apps/mcp-companion/src/failure-handling.ts` | Error codes, rejection paths |
| `slice-f-12.md` | Acceptance criteria verification | `apps/mcp-companion/__tests__/` | All 25 SUBSPEC-F acceptance items |

## Acceptance Criteria (from SUBSPEC-F §10.2, revised)

| # | Acceptance Item | Slice | Test File |
|---|-----------------|-------|-----------|
| 1 | Local companion is authority for live connected document session | f-0 | slice-f-0-companion-config.test.ts |
| 2 | Browser connects over localhost with short-lived pairing token (256-bit, 5-min TTL, one-time use) | f-2 | slice-f-2-pairing-token.test.ts |
| 3 | MCP and UI send commands to same in-process command bus | f-0 | slice-f-0-companion-config.test.ts |
| 4 | Companion emits document revision events to UI | f-0 | slice-f-0-companion-config.test.ts |
| 5 | All mutating tools accept MutationEnvelope with expectedRevision, requestId | f-1 | slice-f-1-mutation-envelope.test.ts |
| 6 | Destructive operations default to dry-run with confirmation token | f-7 | slice-f-7-destructive-protocol.test.ts |
| 7 | Confirmation token: 60s TTL, one-time use, bound to project + revision + operation + args | f-1 | slice-f-1-mutation-envelope.test.ts |
| 8 | maxBlocksPerCall: 250,000 default changed cells, 1,000,000 configurable, 5,000,000 absolute | f-11 | slice-f-11-failure-handling.test.ts |
| 9 | Duplicate requestId returns original result without reapplying (idempotency ordering: auth → identity → cache check → revision check) | f-1 | slice-f-1-mutation-envelope.test.ts |
| 10 | Idempotency results persisted atomically with successful document commits | f-1 | slice-f-1-mutation-envelope.test.ts |
| 11 | Agent Log sanitizes tokens, paths, usernames, secrets, raw NBT, raw file contents | f-9 | slice-f-9-agent-log.test.ts |
| 12 | Path sandboxing: approved directories only, symlink resolution, traversal blocked, atomic writes | f-11 | slice-f-11-failure-handling.test.ts |
| 13 | Loopback-only binding, exact origin allowlist, DNS rebinding protection, Chrome PNA validation | f-2 | slice-f-2-pairing-token.test.ts |
| 14 | Same command produces same result through UI and MCP | f-0 | slice-f-0-companion-config.test.ts |
| 15 | Browser and MCP use same command/query implementation | f-0 | slice-f-0-companion-config.test.ts |
| 16 | Single document authority: browser-live mode or headless local-file mode; no split-brain | f-0 | slice-f-0-companion-config.test.ts |
| 17 | Pairing token: plaintext never stored; only SHA-256 hash persisted; revocation, expiry, idle timeout | f-2 | slice-f-2-pairing-token.test.ts |
| 18 | Never expose pairing tokens in URLs or logs | f-2, f-9 | slice-f-2-pairing-token.test.ts, slice-f-9-agent-log.test.ts |
| 19 | Candidate-cell, runtime, memory limits alongside changed-block limits | f-11 | slice-f-11-failure-handling.test.ts |
| 20 | Complete Zod input/output schemas for every MCP tool | f-3, f-4, f-5, f-6 | All tool test files |
| 21 | Operation diff (single command) vs revision diff (between revisions) clarified | f-6 | slice-f-6-history.test.ts |
| 22 | Operations classified: confirmation-required (destructive) vs immediate (non-destructive) | f-7 | slice-f-7-destructive-protocol.test.ts |
| 23 | One-click undo available only when associated operation is latest undoable action | f-6 | slice-f-6-history.test.ts |
| 24 | Bounded Agent Log serialization (10,000 entries, 50 MiB); malicious metadata protection | f-9 | slice-f-9-agent-log.test.ts |
| 25 | Chrome PNA, CORS, preflight, WebSocket, production-origin validated in Phase 0 | f-2 | slice-f-2-pairing-token.test.ts |

## Research gate → docs/research/subplan-f.md

Research questions F-1 through F-5 documented there.

## Traceability

All 25 SUBSPEC-F §10.2 acceptance items mapped to slices and test files above. Unmapped criteria = plan bug.

## Verification checklist

- [ ] One consistent slice list (13 slices, no duplicates)
- [ ] Traceability table maps all 25 SUBSPEC-F §10.2 items
- [ ] No claims of verification without running tests
- [ ] Change committed with descriptive message
