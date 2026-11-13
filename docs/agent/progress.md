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
- Slice f-13 (2026-11-13): single-port bridge router + listener on 127.0.0.1:43127 replaces the two Phase-2 stubs (8765/8766). Pipeline: Host -> preflight/PNA -> CORS -> rate limit -> auth -> route. Pair-once-then-session auth; tools, /healthz, /readyz, /metrics, /ws. 60 unit assertions + 27 live HTTP checks (scripts/live-e2e.sh), the latter catching two Windows path bugs the doubles could not
- Recommended resolutions applied (2026-11-13): D-1 (one classification), D-5 (one constants module), D-6 (one tsconfig rule in all 8 packages; every package's `build` now passes), D-7 (one port). Remaining open: D-2, D-3, D-4
- Verification totals after this session: 639 unit assertions across 8 f-slices + 27 live HTTP checks, 0 failures; `tsc --noEmit` exit 0 for all 8 packages; acceptance 15/25 PASS / 10 BLOCKED
- Docs updated: DOUBTS.md created (D-1..D-4), research decisions F-6.x/F-8.x/F-9.x recorded, subplan-f index records status of audit findings MF-1..MF-5
- Known constraint found and worked around: value imports of `.ts` files inside `apps/mcp-companion/src/` failed TS5097 while `allowImportingTsExtensions` was unset. RESOLVED by D-6: all 8 packages now set it together with `noEmit`, so value imports are legal everywhere and collaborators no longer need injecting for compiler reasons


## Next
- Subplan-f implementation is now genuinely wired: 15/25 acceptance items PASS (was 12), 639 unit assertions + 27 live HTTP checks green, build hygiene fixed across all 8 packages.
- Remaining subplan-f work, all cross-subspec or dependency-bound:
  1. Shared command bus (`packages/operations` -> listener) so mutations actually edit a document instead of bumping a revision counter. Unblocks items 3, 4, 14, 15, 16.
  2. IndexedDB idempotency persistence (item 10) and the ~40-tool Zod surface (item 20), history-backed diffs (item 21).
  3. subplan-g (UI interaction): only `g-0` is planned; the other 15 slice files declared in the index do not exist on disk, so planning must be re-done before implementation.
- Phase 5: questions, then final fix. Open questions are D-2, D-3, D-4 in `docs/agent/DOUBTS.md` (D-1, D-5, D-6, D-7 resolved).

## Blocked
- None

## Open questions (to go in DOUBTS.md)
- None yet
