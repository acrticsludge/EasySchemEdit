# DESIGN — Precision instrument

Source of truth: `docs/specs/SPEC.ui-precision-instrument.md` §4 (frozen decisions), superseded where it conflicts with `docs/specs/SPEC.ui-dense-tool.md` §4. Rationale: `docs/audits/ui-critique-2026-11-18.md`.

Mode: **Operate**. World: **Precision instrument**. One accent, one type system, one spacing scale. State reads through a glyph or word plus color, never color alone. No new font or runtime dependency.

## Palette

Tokens are the only color source. Components consume `var(--token)`; no hardcoded hex in inline styles. Values below are the pass-2 amplification in `apps/web/src/editor/design-tokens.css`.

| Role | Token | Value |
|---|---|---|
| Canvas | `--ink-900` | `#07090C` |
| Panel | `--ink-850` | `#10141A` |
| Raised / input well | `--ink-800` | `#181E26` |
| Control face | `--ink-700` | `#222A34` |
| Hairline | `--line` | `#2C3642` |
| Strong rule | `--line-strong` | `#3C4A58` |
| Primary text | `--text` | `#F2F5F4` |
| Secondary text | `--text-dim` | `#A7B3BD` |
| Faint / label | `--text-faint` | `#788691` |
| Signal (only accent) | `--signal` | `#F2B14A` |
| Signal wash | `--signal-wash` | `rgba(242,177,74,.16)` |
| OK | `--ok` | `#5BD1A0` |
| Warning | `--warn` | `#E8C15A` |
| Danger | `--danger` | `#F2685E` |

## Type

- Labels: system UI stack, 10px, uppercase, `0.1em` tracking, `--text-faint`.
- Body/controls: 12px, `--text`.
- Emphasis: 13px, weight 600, one weight step per row maximum.
- Numbers: `ui-monospace, 'SF Mono', 'Cascadia Code', 'Roboto Mono', monospace`, `font-variant-numeric: tabular-nums`, 12px, `--text`. Applies to coordinates, dimensions, counts, revision, FPS.
- No new font dependency.

## Space and size

- Scale: 2 / 4 / 8 / 12 / 24px. `--space-0h` is 2px. Legacy `--spacing-*` values are unchanged.
- Control heights: 24px icon action, 26px input, 30px panel header, 44px toolbar, 28px tab bar, 28px status bar.
- List rows in the outliner and dock: 24px.
- Defaults: left panel 240px, bottom dock 180px.
- Collapse 5px and 6px one-offs to the nearest step.

## Dense-tool layout (pass 2)

- The five shell regions keep their spatial roles. Changes are dimension and framing on existing elements only.
- Toolbar stays one row at 44px, with `--line-strong` group separators and tighter internal gaps. All controls stay; compact mode still applies below 1280px.
- The existing viewport container gets an 8px inset from the shell edges and a 1px `--line` frame. No wrapper element is added.
- Panel headers are 30px with a faint `--ink-900` inset strip below the header text.
- A selected outliner row uses a 1px `--signal` rule plus `--signal-wash`, replacing the old 3px colored border. Color still encodes state.
- Status bar is 28px and divides its three groups with `--line-strong` rules. `isDirty` behavior is unchanged.
- Dock tab bar stays horizontal at 28px with denser tabs. All five tabs and their content stay.
- Floating selected-placement bar uses the same control heights and spacing tokens, keeps its width cap and tooltips, and collapses to icons below 1280px.

## Rules

1. `--signal` appears only on active tool or active mode/segmented control, selected outliner row, active tab underline, and focus ring.
2. Every interactive control gets a 2px `--signal` focus ring at 2px offset. Never `outline: none` without a replacement.
3. State uses glyph or word plus color: lock, visibility, conflict, dirty/save.
4. One local 16px stroke icon component at 1.5px stroke replaces emoji and Unicode glyphs in chrome.
5. Floating bar uses the same palette, caps its width, moves shortcut text into `title` tooltips, and collapses to icons below 1280px.
6. Status bar accepts `isDirty`; when dirty it shows a warning glyph and "Unsaved changes" instead of a permanent green "Saved" dot.
7. Motion: 120ms ease-out state changes, 180ms panel collapse, disabled under `prefers-reduced-motion`.
8. Touched files contain no hardcoded fallback hex in inline styles.
9. No new features. No region, activity rail, button, control, shortcut, dependency or font is added. Every existing handler, store call, tooltip and aria-label is preserved.
10. No decorative blur, no thick colored list borders, no emoji or Unicode glyphs in chrome. Icon-only controls keep their section labels and tooltips.

## Research note (2026-11-18)

- GINEXYS, *Dense Interfaces Need Spatial Hierarchy, Not More Whitespace*: dense tools need stable spatial roles, not more whitespace; the canvas carries identity; color encodes state rather than energy; verification is geometric (measure bounds and compare `scrollWidth` with viewport width). Applied here: no new regions, all changes are presentation over existing controls, the viewport frame uses tokens, and acceptance includes measured overflow checks.
- Blender HIG: expose the most common widgets accessibly, push lesser-used ones down. Applied here: file actions keep labels at desktop and collapse below 1280px.
- `ui-ux-pro-max` at density 8 for a dark professional desktop tool returns dark-mode primary, no pure black, SVG icons only, visible focus, and reduced motion. Its violet/cyan palette is rejected: the pinned world has one amber accent and the brief wins over a default style match.

## Legacy aliases

Every existing custom-property name is kept as an alias so untouched code keeps rendering.

| Legacy name | Alias target |
|---|---|
| `--color-bg-primary`, `--color-bg-canvas` | `--ink-900` |
| `--color-bg-secondary`, `--color-bg-panel` | `--ink-850` |
| `--color-bg-tertiary`, `--color-bg-elevated` | `--ink-800` |
| `--color-border`, `--color-border-subtle` | `--line` |
| `--color-border-hover` | `--line-strong` |
| `--color-text-primary` | `--text` |
| `--color-text-secondary` | `--text-dim` |
| `--color-text-muted` | `--text-faint` |
| `--color-accent`, `--color-accent-hover`, `--color-accent-primary` | `--signal` |
| `--color-error`, `--color-error-text` | `--danger` |
| `--color-warning` | `--warn` |
| `--color-success`, `--color-conflict-clean` | `--ok` |
| `--color-conflict-same-state` | `--warn` |
| `--color-conflict-state` | `--danger` |
| `--spacing-xs`, `--spacing-sm`, `--spacing-md` | `--space-1` (4px), `--space-2` (8px), `--space-3` (12px) |
| `--spacing-lg`, `--spacing-xl`, `--spacing-xxl` | `16px`, `24px`, `32px` (original values, unchanged) |

`--color-text-muted` resolves to `--text-faint` (#788691), which is darker than `--color-text-secondary` / `--text-dim` (#A7B3BD). The previous scale was inverted. The `--spacing-*` names are legacy compatibility aliases and keep their original values: `--spacing-lg` 16px, `--spacing-xl` 24px, `--spacing-xxl` 32px. The new 2 / 4 / 8 / 12 / 24 scale lives in `--space-0h`..`--space-4` and component usage.
