# Subplan — Dense pro-tool amplification

Source spec: `docs/specs/SPEC.ui-dense-tool.md`
Baseline: `docs/agent/baseline.md` — master @ `850507a`, typecheck 0, tests 105/105, build 0.

## Goal

Make the editor visibly different at a glance by unifying all surfaces and tightening the existing layout, with no new features.

## Slice graph

```
p2-0  (tokens + 15 component files)
  └──> p2-1  (7 styled components + design docs)
         └──> p2-2  (verification)
```

## Global constraints

- No new component file, no new interactive control, no new dependency or font.
- No behavior change: handlers, commands, shortcuts, aria-labels, and store calls stay byte-identical.
- No hardcoded hex outside `design-tokens.css` in `apps/web/src/editor/**`.
- Do not stage or commit. Do not touch restored schematic files.
- Style: 2-space indent, single quotes, semicolons, explicit `.ts/.tsx` extensions.

## Delegation

Implementation slices run as subagents with the full brief in their slice file. Verification is orchestrator-run.
