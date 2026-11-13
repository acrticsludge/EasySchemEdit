# Phase 4 Post-Subplan Audit — Subplan-F (MCP Adapter)

**Method:** Phase 4 requires a full audit after each SUBSPEC run (GOAL.md §PHASE 4): integration tests, acceptance traceability, dependency boundaries, performance sanity; fix before moving on.
**Scope:** slices f-0 … f-12 as implemented, plus the round-1 audit findings MF-1 … MF-5.
**Date:** 2026-11-13. **Commit at audit:** `4dd03b9`.

## Verification performed (commands and results)

| Check | Command | Result |
|-------|---------|--------|
| Typecheck | `cd apps/mcp-companion && node <typescript@5.9.3>/bin/tsc --noEmit` | exit 0 |
| f-7 tests | `node --experimental-strip-types __tests__/slice-f-7-destructive-protocol.test.ts` | 89 pass / 0 fail |
| f-8 tests | `… slice-f-8-mcp-export.test.ts` | 58 pass / 0 fail |
| f-9 tests | `… slice-f-9-agent-log.test.ts` | 93 pass / 0 fail |
| f-10 tests | `… slice-f-10-health.test.ts` | 59 pass / 0 fail |
| f-11 tests | `… slice-f-11-failure-handling.test.ts` | 112 pass / 0 fail |
| f-12 acceptance | `… slice-f-12-acceptance.test.ts` | 54 assertions / 0 fail, 25/25 items (12 PASS, 13 BLOCKED) |
| Aggregate | re-run of all six files, counts summed programmatically | **465 assertions, 0 failures** |
| Boundary check | `grep -rn "from 'three\|from 'react\|from 'node:\|from '@modelcontextprotocol" apps/mcp-companion/src/*.ts` excluding `server.ts`/`bridge.ts`/`health.ts` | no matches — the new modules import no framework, Node, Three.js or MCP SDK |
| Cross-package imports | `grep -rn "import type" apps/mcp-companion/src/destructive-protocol.ts apps/mcp-companion/src/mcp-export.ts` | type-only `.ts` imports of domain types only (elided at compile time) |
| Regression across packages | domain 20/20, formats 14/14, operations/persistence/renderer acceptance | all pass (baseline re-confirmed) |

## Findings

### High

**PF-1: Slices f-0 … f-6 are types-only — no executable behaviour, no tests**

- **Evidence:** `src/companion-config.ts` (72 lines, 5 exported types, 0 functions), `src/pairing-token.ts` (97 lines, 5 types, 0 functions), `src/mutation-envelope.ts` (125 lines, 5 types), `src/tools/read.ts` (212 lines), `src/tools/placement.ts` (169), `src/tools/clipboard.ts` (95), `src/tools/history.ts` (114) — all type declarations. `grep -c "crypto|randomBytes|createHash" src/pairing-token.ts` = 1 (a comment).
- **Impact:** acceptance items 1, 2, 13, 16, 17, 20, 21 are blocked on this, not merely on wiring. The pairing-token lifecycle (the security core of SPEC-F) has no implementation. 7 of the 13 BLOCKED acceptance items trace here.
- **Fix:** implement f-2 (pairing token + SHA-256 + revocation + expiry + idle timeout), f-0 (session/authority lifecycle), and the f-3…f-6 tool surface against the now-existing f-7/f-11 collaborators. Not fixed in this pass — it is the next unit of work, not a defect in f-7…f-12.

**PF-2: No bridge or server wiring exists for the new modules**

- **Evidence:** `src/server.ts` declares 4 Zod schemas and 4 stub handlers; `src/bridge.ts` is a 37-line echo server on port 8765; `src/health.ts` is a 24-line listener on port 8766. None of `destructive-protocol.ts`, `mcp-export.ts`, `agent-log.ts`, `health-report.ts`, `failure-handling.ts` is referenced by them. Ports also disagree with SPEC-F F2 (`43127`).
- **Impact:** the implemented logic is not reachable from any MCP tool call. A consumer could call the modules in-process only.
- **Fix:** a dedicated wiring slice that registers the tool surface against the real MCP SDK, points the bridge at 43127, and serves `/healthz`, `/readyz`, `/metrics` from `createHealthReporter`. Tracked as a new slice, not silently folded into an existing one.

### Medium

**PF-3: Two competing destructive-classification vocabularies still coexist**

- **Evidence:** `src/mutation-envelope.ts:101` exports verb-keyed `DESTRUCTIVE_OPERATIONS` (`delete, replace, paste, …`); `src/destructive-protocol.ts` exports SPEC-F §6 tool-keyed `CONFIRMATION_REQUIRED_TOOLS`. The two disagree on `paste`/`paste_clipboard`.
- **Impact:** a caller importing the verb set gets different gating than a caller using the protocol. F-7's tests pin the tool-name set, so the risk is limited to whoever imports the older constant.
- **Status:** documented as DOUBTS D-1 with a recommended fix (delete the verb set, single name space). Not applied unilaterally — GOAL.md forbids silently overwriting an existing decision.

**PF-4: `MCP_LIMITS` and `LIMITS` duplicate the same six numbers**

- **Evidence:** `destructive-protocol.ts` `MCP_LIMITS` and `failure-handling.ts` `LIMITS` hold identical values; f-11's test asserts them in lockstep precisely because a value import across the two files fails TS5097.
- **Impact:** a future edit to one and not the other produces a silent divergence in budget enforcement.
- **Fix:** fold the constants into one module that neither file needs to import for values (e.g. export them from a module both re-export through `index.ts`), or relax the package's tsconfig to set `allowImportingTsExtensions` alongside `noEmit`. Recorded in DOUBTS D-5.

**PF-5: tsconfig silently permits type-only `.ts` imports but rejects value imports**

- **Evidence:** `apps/mcp-companion/tsconfig.json` has no `allowImportingTsExtensions`, so `import type { X } from './y.ts'` compiles (elided) while `import { f } from './y.ts'` fails TS5097. This bit slice f-10 (fixed by injecting the sanitizer) and constrained f-11's design. Sibling packages (domain, formats) DO set the flag — and then need `--noEmit`, which their build scripts do not pass, so plain `tsc` there fails with TS5096.
- **Impact:** the codebase's build configuration is inconsistent across packages and pushes designs toward injection purely to satisfy the compiler.
- **Fix:** make the three package tsconfigs agree and make `build` scripts consistent with whichever choice is made. Tracked as DOUBTS D-6.

### Low

**PF-6: 13 of 25 acceptance items are BLOCKED, concentrated in cross-subspec work**

- **Evidence:** `slice-f-12.md` traceability — items 3, 4, 14, 15, 16 are cross-subspec (MCP + UI) and items 1, 2, 10, 13, 17, 20, 21, 25 need unimplemented dependencies.
- **Impact:** SUBSPEC-F's acceptance cannot reach green until subplan-g and the wiring slices land. The harness reports BLOCKED rather than green, so the gap is visible instead of hidden.
- **Fix:** none required in this pass; the traceability is honest.

**PF-7: No integration test exercises two modules together**

- **Evidence:** each of f-7 … f-12 uses its own in-memory double; the acceptance harness (f-12) is the only file that imports across modules, and it wires f-7's protocol to a hand-rolled service double rather than to f-8/f-9/f-10/f-11.
- **Impact:** interface mismatches between the modules would surface only at wiring time.
- **Fix:** the wiring slice (PF-2) should include an end-to-end in-process test: dry-run → apply → Agent Log entry → export artefact → health/metrics reflect it.

## Round-1 audit findings (MF-1 … MF-5)

| Finding | Status |
|---------|--------|
| MF-1 (High): no test files for any slice | Resolved for f-7…f-12 (6 files, 465 assertions). Open for f-0…f-6 (see PF-1). |
| MF-2 (Med): items 3, 4, 14, 15, 16 mapped to an MCP-only slice | Resolved — re-mapped to BLOCKED with "cross-subspec (MCP + UI)" as the named dependency. |
| MF-3 (Med): f-8 overlaps c-8 (.vxproj) | Resolved by role split — c-8 owns the archive format, f-8 owns the workspace write path. |
| MF-4 (Med): is Zod permitted? | Resolved — Zod is an implementation dependency of the app package; the "pure TypeScript" constraint covers the domain/logic modules, which import no runtime libraries (verified by the boundary grep). |
| MF-5 (Low): verification checklist unmet | Resolved for f-7…f-12; every slice in the range records command + result. |

## Verdict

Subplan-f implementation (f-7 … f-12) is **Yellow**. The delivered slices are sound — 465 assertions pass, typecheck is clean, no forbidden imports, no regressions — but the subplan as a whole cannot be called green: 7 of 13 BLOCKED acceptance items trace to slices f-0 … f-6 having no implementation (PF-1), nothing is wired into a real MCP surface (PF-2), and one classification vocabulary still competes with the authoritative one (PF-3).

**Next actions, in order:**
1. Implement f-2 (pairing token) and f-0 (session/authority lifecycle) — the security core and 7 BLOCKED items.
2. Wire the tool surface + bridge on port 43127 + health endpoints (PF-2), with the end-to-end test from PF-7.
3. Resolve PF-3 (delete the verb-name set) and PF-4/PF-5 (one constants module; consistent tsconfig) after user confirmation, since both touch existing decisions.
4. Then subplan-g (UI), which unblocks items 3, 4, 14, 15, 16.
