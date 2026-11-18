# Slice p2-2 — Verification gate

Owner: orchestrator.

## Goal

Prove the second pass meets spec §6 and record the evidence.

## Steps

1. Review the full diff; confirm no new component file and no new `<button>`.
2. Grep for hardcoded hex across `apps/web/src/editor/**`; confirm only `design-tokens.css` matches.
3. Run `pnpm typecheck`, `pnpm test`, `pnpm --filter @easyschemedit/web build`; paste verbatim results.
4. Start `astro dev` and inspect `/editor` in a real browser at 1440x900, 1280x800, 1024x768. Check: no overflow, all toolbar buttons visible, surface separation readable, amber active states, and no old blue/purple surfaces anywhere.
5. Append observed results and screenshot paths to `docs/agent/progress.md`. Never mark a check PASS without the command output.

## Output format and acceptance

- Every spec §6 check reported PASS or BLOCKED with evidence.
- No commit.
