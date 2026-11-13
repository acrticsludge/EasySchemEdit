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
- Docs updated: DOUBTS.md created (D-1..D-4), research decisions F-6.x/F-8.x/F-9.x recorded, subplan-f index records status of audit findings MF-1..MF-5
- Known constraint found and worked around: value imports of `.ts` files inside `apps/mcp-companion/src/` fail TS5097 (allowImportingTsExtensions is unset in that tsconfig, so only type-only `.ts` specifiers are elided). Collaborators are injected (f-10's sanitizer, f-11's limits) rather than imported


## Next
- Subplan-f COMPLETE (f-0 … f-12). Next: subplan-g (UI interaction) slices — only `g-0` is planned; the remaining slices need planning first (Phase 2 was declared COMPLETE for subplan-g at 16 slices, but only `slice-g-0.md` exists on disk — the other 15 slice files are missing, so planning must be re-done before implementation).
- Post-subplan audit for subplan-f (Phase 4 requires a full audit per SUBSPEC): integration tests, acceptance traceability, dependency boundaries, performance sanity.
- Phase 5: questions, then final fix.

## Blocked
- None

## Open questions (to go in DOUBTS.md)
- None yet
