# Slice ui-3 — Verification gate

Owner: orchestrator (final review is not delegated per `AGENTS.md` §1).

## Goal

Prove the restyle meets every acceptance check in `docs/specs/SPEC.ui-precision-instrument.md` §6 and record the observed evidence.

## Constraints

- Do not edit component code in this slice. Fix findings by sending them back to the owning slice.
- Never mark a check PASS without the command output in hand.
- Never weaken a test to make a gate pass.

## Inputs

- All files changed in ui-0, ui-1, ui-2
- `docs/specs/SPEC.ui-precision-instrument.md` §6

## Steps

1. Review the full `git diff` of this run's files. Check for hardcoded hex, emoji, `outline: 'none'`, and accent used outside the four allowed places.
2. Run `pnpm typecheck` and paste the result.
3. Run `pnpm test` and paste the summary line.
4. Run `pnpm --filter @easyschemedit/web build` and paste the result.
5. Start the web dev server and inspect `/editor` in a real browser at 1440px, 1280px, and 1024px. Check: no horizontal overflow in the floating bar, all text legible, focus ring visible on keyboard focus, selected row and active tab read clearly, no off-palette color.
6. Spot-check at least 30% of each subagent's claims against the files.
7. Append the observed results to `docs/agent/progress.md` with commands and outputs.
8. If the app cannot be served, record the blocker explicitly and mark the visual check BLOCKED rather than PASS.

## Output format and acceptance

- All spec §6 checks reported as PASS or BLOCKED with evidence.
- No commit made.
- Any finding routed back to ui-1 or ui-2 with a concrete file and line.
