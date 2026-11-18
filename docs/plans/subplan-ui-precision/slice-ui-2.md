# Slice ui-2 — Data surfaces

## Goal

Restyle the outliner, inspector, and floating selected-placement bar to the Precision-instrument system without changing any editor command.

## Constraints and non-goals

- ui-0 must be merged first: tokens, focus-ring rule, and `Icon` are available.
- No changes to shell chrome files (ui-1 owns those).
- No behavior change: every `store.execute`, controller call, keyboard shortcut, and state transition stays exactly as-is.
- Numeric precision is the point: every coordinate, dimension, count, and step value uses the mono/tabular style.

## Inputs

- `docs/specs/SPEC.ui-precision-instrument.md` §4
- `apps/web/src/editor/ui/Icon.tsx` (from ui-0)
- `apps/web/src/editor/layout/OutlinerPanel.tsx`
- `apps/web/src/editor/layout/InspectorPanel.tsx`
- `apps/web/src/editor/viewport/SelectedPlacementBar.tsx`

## Steps

1. `OutlinerPanel.tsx`: selected row gets `--signal-wash` background and a 3px `--signal` left rule; label/number styles move to tokens; visibility and lock use `Icon` (`eye`/`eyeOff`, `lock`/`unlock`) with existing `aria-label` preserved; duplicate/delete use `Icon`. Remove `outline: 'none'` and all hardcoded hex. Keep the 28px row height and the existing filter box behavior.
2. `InspectorPanel.tsx`: section labels use the uppercase 11px label style; all `NumericField` inputs and stepper actions use mono/tabular numerals and `Icon` arrows; stats use mono values; active rotation and mirror segments use `--signal-wash` + `--signal` border; lock/duplicate/delete actions use `Icon` and tokens. Remove `outline: 'none'` and all hardcoded hex. Keep every handler and local state exactly as-is.
3. `SelectedPlacementBar.tsx`: move to `--ink-800` face, `--line` border, remove the slate hex palette and heavy shadow. Keep the concept and position. Move shortcut text out of visible labels into existing `title` attributes: "Move", "Rotate", "Duplicate", "Delete". Use `Icon` for all controls. Add `maxWidth: 'calc(100% - 24px)'` and `overflowX: 'auto'` so it never spills out of the viewport. Under a 1280px viewport, hide the text spans on the stepper and nudge controls via a CSS class defined in `design-tokens.css` (or a media-query style object) so the bar collapses toward icons. Remove all hardcoded hex.
4. Verify no `outline: 'none'`, emoji, or Unicode glyph remains in the three files.

## Output format and acceptance

- Files changed listed in the report.
- `pnpm typecheck` exit 0.
- `pnpm --filter @easyschemedit/web build` exit 0.
- Existing `slice-g-5-outliner`, `slice-g-6-inspector`, and floating-bar-related tests still pass unchanged.
- No hardcoded hex, emoji, or `outline: 'none'` in the three files.

## Background

The audit found two independent nudge implementations with different visual languages, emoji mixed into chrome, and a floating bar using a slate palette unrelated to the shell. This slice unifies them visually while leaving their logic untouched.
