# Phase 3 Audit Round 1 — Subplan-F (MCP Adapter)

**Source:** `docs/plans/subplan-f/index.md`, `docs/specs/subs/SUBSPEC-F_MCP_ADAPTER.md`
**Method:** Fresh-context audit per GOAL.md §PHASE 3. Severity-ranked findings with evidence.

## Findings

### High

**MF-1: No test files exist for any subplan-f slice**

- Evidence: The traceability table maps all 25 acceptance items to test files (slice-f-0 through slice-f-12 tests), but `apps/mcp-companion/__tests__/` does not exist. No test files have been created.
- Impact: Zero test coverage for the MCP adapter. All 25 SUBSPEC-F acceptance criteria are unverified.
- Fix: Create test files for slices f-0 through f-12, or mark as "to verify" per GOAL.md rules.

### Medium

**MF-2: Acceptance items 3, 4, 14, 15, 16 mapped to slice f-0 but involve cross-subspec concerns**

- Evidence: subplan-f/index.md maps acceptance items 3 ("MCP and UI send commands to same in-process command bus"), 4 ("Companion emits document revision events to UI"), 14 ("Same command produces same result through UI and MCP"), 15 ("Browser and MCP use same command/query implementation"), 16 ("Single document authority") to slice f-0. These involve both the MCP companion (subplan-f) and the UI (subplan-g). The plan places cross-subspec concerns in an MCP-only slice.
- Impact: Cross-subspec boundary ambiguity — acceptance criteria that require coordination between MCP and UI are mapped to an MCP-only slice.
- Fix: Re-map items 3, 4, 14, 15, 16 to subplan-g (UI side) or clarify that f-0 handles the MCP side while g handles the UI side.

**MF-3: Slice f-8 (Export through MCP) overlaps with subplan-c slice c-8 (.vxproj archive)**

- Evidence: subplan-f/index.md slice f-8 covers "Export through MCP: write to approved workspace, artifact handle". subplan-c/index.md slice c-8 covers ".vxproj archive: ZIP64, DEFLATE level 6, manifest.checksums". Both cover export/archive functionality.
- Impact: Unclear which subplan owns .vxproj export — subplan-c (archive format) or subplan-f (MCP export through MCP).
- Fix: Clarify ownership — subplan-c handles the .vxproj archive format, subplan-f handles the MCP tool interface for initiating export.

**MF-4: Acceptance item 20 mapped to f-3, f-4, f-5, f-6 but Zod schemas are runtime code**

- Evidence: subplan-f/index.md maps acceptance item 20 ("Complete Zod input/output schemas for every MCP tool") to slices f-3 through f-6. The constraint says "Pure TypeScript, zero framework/browser/Node/Three.js/MCP imports" but Zod is a runtime validation library dependency, not just a type definition.
- Impact: Zod schemas are implementation code, not just types. The constraint may need clarification about whether Zod is allowed as a dependency.
- Fix: Clarify whether Zod is permitted as a dependency in the MCP companion package, or re-frame acceptance item 20 as type-only Zod schema definitions.

### Low

**MF-5: No test files exist — verification checklist item cannot be satisfied**

- Evidence: subplan-f/index.md verification checklist says "No claims of verification without running tests" but no tests exist.
- Impact: The plan's own verification requirement is unmet.
- Fix: Create test files or mark all as "to verify".

## Traceability: SUBSPEC-F §10.2 Acceptance → Slice → Test File (with gaps flagged)

| # | Acceptance Item | Slice | Test File | Status |
|---|-----------------|-------|-----------|--------|
| 1 | Local companion is authority for live session | f-0 | slice-f-0-companion-config.test.ts | NOT CREATED (MF-1) |
| 2 | Browser connects over localhost with pairing token | f-2 | slice-f-2-pairing-token.test.ts | NOT CREATED (MF-1) |
| 3 | MCP and UI send commands to same command bus | f-0 | slice-f-0-companion-config.test.ts | NOT CREATED (MF-1, MF-2) |
| 4 | Companion emits document revision events to UI | f-0 | slice-f-0-companion-config.test.ts | NOT CREATED (MF-1, MF-2) |
| 5 | All mutating tools accept MutationEnvelope | f-1 | slice-f-1-mutation-envelope.test.ts | NOT CREATED (MF-1) |
| 6 | Destructive operations default to dry-run | f-7 | slice-f-7-destructive-protocol.test.ts | NOT CREATED (MF-1) |
| 7 | Confirmation token: 60s TTL, one-time use | f-1 | slice-f-1-mutation-envelope.test.ts | NOT CREATED (MF-1) |
| 8 | maxBlocksPerCall limits | f-11 | slice-f-11-failure-handling.test.ts | NOT CREATED (MF-1) |
| 9 | Duplicate requestId returns original result | f-1 | slice-f-1-mutation-envelope.test.ts | NOT CREATED (MF-1) |
| 10 | Idempotency results persisted atomically | f-1 | slice-f-1-mutation-envelope.test.ts | NOT CREATED (MF-1) |
| 11 | Agent Log sanitizes tokens, paths, secrets | f-9 | slice-f-9-agent-log.test.ts | NOT CREATED (MF-1) |
| 12 | Path sandboxing: approved directories, traversal blocked | f-11 | slice-f-11-failure-handling.test.ts | NOT CREATED (MF-1) |
| 13 | Loopback-only binding, CORS, PNA validation | f-2 | slice-f-2-pairing-token.test.ts | NOT CREATED (MF-1) |
| 14 | Same command produces same result through UI and MCP | f-0 | slice-f-0-companion-config.test.ts | NOT CREATED (MF-1, MF-2) |
| 15 | Browser and MCP use same command/query implementation | f-0 | slice-f-0-companion-config.test.ts | NOT CREATED (MF-1, MF-2) |
| 16 | Single document authority: browser-live or headless | f-0 | slice-f-0-companion-config.test.ts | NOT CREATED (MF-1, MF-2) |
| 17 | Pairing token: plaintext never stored, SHA-256 hash | f-2 | slice-f-2-pairing-token.test.ts | NOT CREATED (MF-1) |
| 18 | Never expose pairing tokens in URLs or logs | f-2, f-9 | slice-f-2-pairing-token.test.ts, slice-f-9-agent-log.test.ts | NOT CREATED (MF-1) |
| 19 | Candidate-cell, runtime, memory limits | f-11 | slice-f-11-failure-handling.test.ts | NOT CREATED (MF-1) |
| 20 | Complete Zod input/output schemas for every MCP tool | f-3, f-4, f-5, f-6 | All tool test files | NOT CREATED (MF-1, MF-4) |
| 21 | Operation diff vs revision diff clarified | f-6 | slice-f-6-history.test.ts | NOT CREATED (MF-1) |
| 22 | Operations classified: confirmation-required vs immediate | f-7 | slice-f-7-destructive-protocol.test.ts | NOT CREATED (MF-1) |
| 23 | One-click undo only when latest undoable action | f-6 | slice-f-6-history.test.ts | NOT CREATED (MF-1) |
| 24 | Bounded Agent Log serialization | f-9 | slice-f-9-agent-log.test.ts | NOT CREATED (MF-1) |
| 25 | Chrome PNA, CORS, preflight, WebSocket validated | f-2 | slice-f-2-pairing-token.test.ts | NOT CREATED (MF-1) |

## Verdict

Subplan-F is **Red** — no test files exist for any slice, and there are cross-subspec boundary ambiguities (MF-2, MF-3) plus a dependency clarification needed (MF-4).

## Recommended Fixes

1. Fix MF-1: Create test files for all f-slices, or mark as "to verify" pending test harness
2. Fix MF-2: Re-map acceptance items 3, 4, 14, 15, 16 to subplan-g or clarify MCP-side vs UI-side split
3. Fix MF-3: Clarify export ownership — subplan-c (.vxproj format) vs subplan-f (MCP export tool)
4. Fix MF-4: Clarify whether Zod is permitted as a dependency in the MCP companion package
5. Fix MF-5: Create test files or mark all as "to verify"
