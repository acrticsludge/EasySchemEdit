# Slice ui-1 — Shell chrome

## Goal

Restyle the editor frame, top toolbar, bottom dock, and status bar to the Precision-instrument system, and make the save indicator truthful.

## Constraints and non-goals

- ui-0 must be merged first: tokens, focus-ring rule, and `Icon` are available.
- No changes to `OutlinerPanel`, `InspectorPanel`, or `SelectedPlacementBar` (ui-2 owns those).
- No behavior change except threading `isDirty` into `StatusBar`.
- Accent appears only on active tool / active mode, active tab underline, and focus ring. Save, sign-in, and file actions stay neutral.

## Inputs

- `docs/specs/SPEC.ui-precision-instrument.md` §4
- `apps/web/src/editor/ui/Icon.tsx` (from ui-0)
- `apps/web/src/editor/layout/WorkspaceShell.tsx`
- `apps/web/src/editor/layout/Toolbar.tsx`
- `apps/web/src/editor/layout/StatusBar.tsx`
- `apps/web/src/editor/layout/BottomDock.tsx`

## Steps

1. `WorkspaceShell.tsx`: replace all hardcoded hex with tokens; use `--line` on dividers and `--signal` only when a divider is actively being resized; collapse bars use label tokens and the chevron icons; shell background uses `--ink-900`. Pass `isDirty={isDirty}` to `StatusBar`.
2. `Toolbar.tsx`: keep the three groups (project/file, centered tools, right-side overlays/auth). Use 40px height, 12px padding, `--line-strong` group separators. Tools use `Icon` with visible short labels; active tool gets `--signal-wash` background, `--signal` border and text. File actions use a shared neutral style with a clear hover treatment in `--ink-700`. Overlay toggles: active state uses `--signal` border and text, conflicts overlay keeps `--danger` as its semantic marker plus the word "Conflicts". Replace emoji (🤖 👤) with `Icon`. Remove all hardcoded hex.
3. `StatusBar.tsx`: add `isDirty?: boolean` to props. When `isDirty` is true, render the `warning` icon plus "Unsaved changes" in `--warn`; otherwise render `check` plus "Saved" in `--ok`. Empty status message uses `--text-faint`, not a near-invisible hex. Coordinates, revision, and FPS use the mono/tabular style from spec §4. Replace hardcoded hex with tokens. Height 24px.
4. `BottomDock.tsx`: 28px tab bar, active tab gets 2px `--signal` underline and `--text` color. Tab icons come from `Icon`. Tab bodies keep their structure; colors move to tokens. Remove hardcoded hex.
5. Verify no `outline: 'none'` remains in these four files.

## Output format and acceptance

- Files changed listed in the report.
- `pnpm typecheck` exit 0.
- `pnpm --filter @easyschemedit/web build` exit 0.
- `StatusBar` renders "Unsaved changes" when `isDirty` is true; confirmed by reading the JSX and by the existing `slice-g-7-statusbar` test still passing.
- No hardcoded hex and no emoji in the four files.

## Background

The audit found the status bar permanently showing a green "Saved" dot, three competing blues, and icon glyphs mixed between emoji and ASCII. This slice fixes the chrome without touching the data panels.
