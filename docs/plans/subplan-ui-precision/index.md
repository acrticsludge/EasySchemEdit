# Subplan — Precision-Instrument UI

Source spec: `docs/specs/SPEC.ui-precision-instrument.md`
Source audit: `docs/audits/ui-critique-2026-11-18.md`
Baseline: `docs/agent/baseline.md` — master @ `ed3ae24`, typecheck 0, build 0, tests 105/105.

## Goal

Restyle the editor shell around one accent and one system without changing editor behavior.

## Slice graph

```
ui-0  (tokens + docs + icon component)
 ├──> ui-1  (shell chrome: WorkspaceShell, Toolbar, StatusBar, BottomDock)
 └──> ui-2  (data surfaces: OutlinerPanel, InspectorPanel, SelectedPlacementBar)
            └──> ui-3  (verification gate)
```

`ui-1` and `ui-2` are independent file sets and run in parallel after `ui-0`.

| Slice | Deliverable | Verification |
|---|---|---|
| `ui-0` | Design docs, token foundation, global background, local Icon component | typecheck 0 |
| `ui-1` | Shell chrome restyled, `isDirty` reaches status bar | typecheck 0, build 0 |
| `ui-2` | Outliner, inspector, floating bar restyled | typecheck 0, build 0 |
| `ui-3` | Full gate + browser review at 1440/1280/1024 | all acceptance checks in spec §6 |

## Global constraints

- No behavior change. Do not alter command names, store calls, event handlers, shortcuts, or data flow except to pass `isDirty` into `StatusBar`.
- No hardcoded hex in any touched file. All color goes through `var(--token)`.
- Remove `outline: 'none'` wherever it appears; the global `:focus-visible` rule in `design-tokens.css` supplies the ring.
- State must be readable without color: lock, visibility, dirty/save, conflict each carry a glyph or word.
- Do not stage or commit. Do not touch untracked user files.
- Match existing style: 2-space indent, single quotes, semicolons, explicit `.ts` / `.tsx` extensions on sibling imports.

## Delegation

Per `AGENTS.md` §1, each implementation slice is written by a subagent using the Prompt Pyramid brief in its slice file. The orchestrator re-checks every result: read the diff, run typecheck and the relevant tests, and spot-check claims against the files. The verification slice is orchestrator-run.
