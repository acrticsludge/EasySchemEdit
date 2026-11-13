# Progress Log (GOAL.md OUTPUT HABITS)

## Done
- Phase 0 baseline docs: `docs/agent/baseline.md`, `docs/agent/skills-inventory.md`, `docs/agent/repo-state.md` (all created, verified)
- Subplan-A: all 22 slices planned (`docs/plans/subplan-a/`), fully implemented in `packages/domain/`, 21 tests pass, tsc clean
- Subplan-B: all 15 slices planned (`docs/plans/subplan-b/`), fully implemented in `packages/formats/`, 14 tests pass, tsc clean
- Phase 1: all 7 known conflicts resolved and documented in `docs/agent/phase1-conflicts.md`
- Coordinate transform fixes: origin used in localBlockToWorld/placementWorldBounds/localPointToLocal; rotateAboutPoint math corrected; all tests pass
- Phase 2 H foundation: COMPLETE — all 7 slices done; subplan-c research gate + index + slices c-0, c-1 implemented
- Subplan-C..G: COMPLETE — subplan-c (11 slices, c-0 spec); subplan-d (13 slices, d-0 spec); subplan-e (15 slices, e-0 spec); subplan-f (13 slices, f-0..f-7 implemented); subplan-g (16 slices, g-0 spec)
- Phase 4 re-baseline (2026-11-13): domain 20/20 test files PASS, formats 14/14 PASS, packages operations/persistence/renderer acceptance tests PASS, `tsc --noEmit` clean for domain, formats and apps/mcp-companion
- Slice f-7 (destructive protocol): implemented as executable logic — 89 assertions PASS, tsc clean. Research decisions F-6.1..F-6.5 recorded in `docs/research/subplan-f.md`; open points D-1..D-3 in `docs/agent/DOUBTS.md`
- Subplan-f COMPLETE (2026-11-13) — slices f-7 (89 assertions), f-8 (58), f-9 (93), f-10 (59), f-11 (112), f-12 acceptance (54 assertions, 25/25 items: 12 PASS / 13 BLOCKED). Total 465 assertions, 0 failures, `tsc --noEmit` exit 0
- Slice f-2 second pass (2026-11-13): pairing-token lifecycle + connection security implemented — 111 assertions PASS. Closes audit PF-1's security core: 256-bit one-time tokens, 5-min TTL, 30-min idle timeout, hash-only storage, revocation, rate limiting, exact-origin CORS with PNA, DNS-rebinding Host validation, port 43127. mcp-companion total is now 576 assertions
- Docs updated: DOUBTS.md created (D-1..D-4), research decisions F-6.x/F-8.x/F-9.x recorded, subplan-f index records status of audit findings MF-1..MF-5
- Known constraint found and worked around: value imports of `.ts` files inside `apps/mcp-companion/src/` fail TS5097 (allowImportingTsExtensions is unset in that tsconfig, so only type-only `.ts` specifiers are elided). Collaborators are injected (f-10's sanitizer, f-11's limits) rather than imported


## Next
- Subplan-f COMPLETE (f-0 … f-12) with f-2's security core now implemented (2026-11-13). Next, in the order the round-2 audit recommends:
  1. Remaining f-0..f-6 work: session/authority lifecycle (f-0) and the f-3..f-6 tool surface as real handlers — still types-only.
  2. Wiring slice (audit PF-2): register the tool surface against the MCP SDK, point the bridge at 43127, serve /healthz /readyz /metrics from createHealthReporter, plus the end-to-end in-process test (PF-7).
  3. subplan-g (UI interaction): only `g-0` is planned; the other 15 slice files declared in the index do not exist on disk, so planning must be re-done before implementation. This unblocks acceptance items 3, 4, 14, 15, 16.
- Phase 5: questions, then final fix (DOUBTS D-1..D-7 are the current question set).

## Blocked
- None

## Open questions (to go in DOUBTS.md)
- None yet
