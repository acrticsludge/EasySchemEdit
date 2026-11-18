# Slice p2-1 — Density and layout of the shell

## Goal

Tighten the existing editor shell into a dense professional tool using the new density tokens.

## Constraints and non-goals

- Owns only: `Toolbar.tsx`, `WorkspaceShell.tsx`, `StatusBar.tsx`, `BottomDock.tsx`, `OutlinerPanel.tsx`, `InspectorPanel.tsx`, `SelectedPlacementBar.tsx`, `PRODUCT.md`, `DESIGN.md`.
- No new component, region, control, shortcut, or behavior. Do not add an activity rail.
- Icons continue to come from `apps/web/src/editor/ui/index.ts`.
- No hardcoded hex.

## Inputs

- `docs/specs/SPEC.ui-dense-tool.md` §4
- The seven component files above
- `PRODUCT.md`, `DESIGN.md`

## Steps

1. `Toolbar.tsx`: 44px height, tighter gaps, `--line-strong` group separators. Keep all existing controls and the compact mode below 1280px.
2. `WorkspaceShell.tsx`: give the existing viewport container a 1px `--line` frame and 8px inset using CSS on the existing container only. Default left panel width 240px, default dock height 180px. Keep dividers, collapse behavior, and all handlers.
3. `StatusBar.tsx`: 28px height, three groups separated by `--line-strong` rules. Keep `isDirty` behavior.
4. `BottomDock.tsx`: 28px tab bar, denser tabs, 180px default body. Keep all five tabs and their content.
5. `OutlinerPanel.tsx`: 24px rows, 30px panel header with a faint inset strip below the header text. Change the selected-row marker from a 3px colored left border to a 1px `--signal` rule plus `--signal-wash` background.
6. `InspectorPanel.tsx`: 30px header, 26px inputs, 24px dense control rows. Keep every handler and local state exactly.
7. `SelectedPlacementBar.tsx`: use the new control heights and spacing tokens; keep the 1280px compact behavior and all shortcuts.
8. Update `PRODUCT.md` and `DESIGN.md` to describe the amplified palette, density, and no-new-features constraint. Do not invent claims.

## Output format and acceptance

- List files changed; run `pnpm typecheck` and `pnpm --filter @easyschemedit/web build`; paste verbatim results.
- Confirm no new interactive control was added (diff contains no new `<button>`).
- Confirm no hardcoded hex in the seven files.

## Background

Pass 1 preserved the layout deliberately, which is why the render looked unchanged. This slice changes existing dimensions and framing only.
