# SPEC — Dense pro-tool amplification

Date: 2026-11-18
Status: approved for implementation
Source: user decision after reviewing pass-1 render ("why is it all the same still, colors, layout etc")

## 1. GOAL

Make the editor read as a different, deliberate interface at a glance: unify every visible component under one palette and tighten the existing layout into a dense professional tool, without adding any feature, region, or control.

## 2. CONSTRAINTS AND NON-GOALS

- World stays **Precision instrument**; mode stays **Operate**. This is amplification of the shipped world, not a replacement.
- **No new features.** No new regions, no activity rail, no new buttons, no new settings, no new dependencies, no new fonts.
- Layout change means resizing, regrouping, and reframing controls that already exist. Every action, handler, shortcut, store call, and `aria-label` stays identical.
- One accent only: `--signal`. Semantic states keep their own colors but never become chrome.
- Every visible component uses tokens. No hardcoded hex remains in `apps/web/src/editor/**`.
- Browser surfaces are themed: `::selection`, caret, scrollbars, focus rings, tabular numerals.
- Craft-floor: no thick colored list borders, no emoji or Unicode icon glyphs, no decorative blur, no hard offset shadows.
- Baseline must stay green: typecheck 0, tests 105/105, build 0.
- No commit; staging and pushing stay with the user.

## 3. INPUTS

| Path | Role |
|---|---|
| `PRODUCT.md`, `DESIGN.md` | Existing design source of truth; updated by this spec |
| `docs/specs/SPEC.ui-precision-instrument.md` | Pass-1 decisions; retained where not superseded |
| `docs/audits/ui-critique-2026-11-18.md` | Original evidence |
| `apps/web/src/editor/design-tokens.css` | Token source of truth |
| `apps/web/src/editor/layout/*.tsx` | Shell and panels |
| `apps/web/src/editor/viewport/SelectedPlacementBar.tsx` | Floating action bar |
| 15 remaining editor component files | The old-palette surface area (865 hardcoded hex values) |
| `apps/web/src/layouts/BaseLayout.astro` | Global background |

The 15 files are: `ImportDialog.tsx`, `BlockPickerPanel.tsx`, `ViewportCanvas.tsx`, `ProjectDialog.tsx`, `TransformControls.tsx`, `LibraryPanel.tsx`, `AssetLoadPanel.tsx`, `ConflictsPanel.tsx`, `ClipboardDrawer.tsx`, `MaterialListPanel.tsx`, `RegionContextMenu.tsx`, `ExportDialog.tsx`, `AgentLogPanel.tsx`, `ProjectExplorer.tsx`, `BakeDialog.tsx`.

## 4. FROZEN DECISIONS

### Palette — raise separation

| Role | Token | Pass 1 | Pass 2 |
|---|---|---|---|
| Canvas | `--ink-900` | `#0B0D0E` | `#07090C` |
| Panel | `--ink-850` | `#111417` | `#10141A` |
| Raised / input well | `--ink-800` | `#171B1F` | `#181E26` |
| Control face | `--ink-700` | `#20262B` | `#222A34` |
| Hairline | `--line` | `#2B3338` | `#2C3642` |
| Strong rule | `--line-strong` | `#3A444B` | `#3C4A58` |
| Primary text | `--text` | `#E8ECEA` | `#F2F5F4` |
| Secondary text | `--text-dim` | `#9AA5A6` | `#A7B3BD` |
| Faint / label | `--text-faint` | `#667276` | `#788691` |
| Signal | `--signal` | `#F2B14A` | `#F2B14A` (unchanged) |
| Signal wash | `--signal-wash` | `rgba(242,177,74,.12)` | `rgba(242,177,74,.16)` |
| OK / Warning / Danger | `--ok` / `--warn` / `--danger` | — | `#5BD1A0` / `#E8C15A` / `#F2685E` (unchanged) |

### Type and density

- Labels: 10px, uppercase, `0.1em` tracking. Body/controls 12px. Emphasis 13px, weight 600.
- Numbers: mono, `tabular-nums`, 12px.
- Control heights: 24px icon action, 26px input, 30px panel header, 44px toolbar, 28px tab bar, 28px status bar.
- Row height in outliner and dock lists: 24px.
- Default dock height: 180px. Default left panel width: 240px.
- Spacing tokens: 2 / 4 / 8 / 12 / 24px. Add `--space-0h: 2px`; keep legacy `--spacing-*` values unchanged.

### Layout changes to existing elements only

1. Toolbar stays one row, grows to 44px, groups get `--line-strong` separators and tighter internal gaps. No control removed or moved; compact mode still applies below 1280px.
2. Viewport gets a 1px `--line` frame and 8px inset from the shell edges. This is a CSS frame on the existing viewport container, not a new element.
3. Panel headers get a 30px height and a faint `--ink-900` inset strip below the header text.
4. Bottom dock tab bar stays horizontal at 28px with denser tabs; default height drops to 180px.
5. Status bar grows to 28px and separates its three groups with `--line-strong` rules.
6. Selected row marker changes from a 3px colored left border to a 1px `--signal` rule plus a `--signal-wash` background (craft-floor compliance).
7. Browser surfaces: `::selection` uses `--signal` background with `--ink-900` text, caret uses `--signal`, scrollbars stay themed.

### Rules

1. One accent, in four places only: active tool/mode, selected row, active tab underline, focus ring.
2. Focus ring stays 2px `--signal`, offset 2px. No `outline: none` without a replacement.
3. State reads through glyph or word plus color.
4. Icons come from the existing local `Icon` set; no emoji or Unicode glyphs.
5. No new dependency or font.
6. No hardcoded hex outside `design-tokens.css` in `apps/web/src/editor/**`.

## 5. STEPS

| Slice | Deliverable |
|---|---|
| `p2-0` | Palette/density tokens, browser-surface theming, and token migration of the 15 remaining component files |
| `p2-1` | Density and layout changes in the 7 already-styled editor components; update `PRODUCT.md`/`DESIGN.md` |
| `p2-2` | Verification: typecheck, tests, build, rendered review at 1440/1280/1024 |

`p2-0` owns `design-tokens.css` and the 15 unstyled files. `p2-1` owns the 7 styled files and the two design docs. No file overlap.

## 6. ACCEPTANCE

1. `pnpm typecheck` exit 0; `pnpm test` 105/105; `pnpm --filter @easyschemedit/web build` exit 0.
2. `Get-ChildItem ... -Include *.tsx | Select-String '#[0-9a-fA-F]{3,8}'` across `apps/web/src/editor/**` returns matches only in `design-tokens.css`.
3. No new UI element, button, region, or feature: the diff adds no component files and no new interactive controls.
4. Rendered at 1440, 1280, 1024: no overflow, no clipped controls, visible surface separation, visible amber active states, no old blue or purple surfaces anywhere in the editor.
5. Observed commands and screenshots recorded in `docs/agent/progress.md`.

## 7. RESEARCH NOTES (2026-11-18)

- GINEXYS, *Dense Interfaces Need Spatial Hierarchy, Not More Whitespace*: dense tools need stable spatial roles, not more whitespace; the canvas carries identity; color should encode state rather than energy; icon-first controls keep section labels and tooltips; verification must be geometric (measure bounds and compare `scrollWidth` to viewport width). Applied here: no new regions, all changes are presentation over existing controls, viewport grid moves onto tokens, and acceptance includes measured overflow checks.
- Blender HIG: expose the most common widgets accessibly, push lesser-used ones down. Applied here: file actions keep labels at desktop, compact below 1280px.
- `ui-ux-pro-max` at density 8 for a dark professional desktop tool returns dark-mode primary, no pure black, SVG icons only, visible focus, and reduced motion. It also suggests a violet/cyan palette; that is rejected because the pinned world has one amber accent and the brief wins over a default style match.

## 8. BACKGROUND

Pass 1 (commit `850507a`) changed the palette from `#0d0d0d` to `#0B0D0E` — effectively invisible — and left 15 component files on the old palette, including the bright blue asset button. The user reviewed the render and asked why it was all the same. This spec fixes both causes: stronger surface separation across the entire app, and layout density changes that do not introduce new functionality.
