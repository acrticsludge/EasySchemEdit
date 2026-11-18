# DESIGN — Precision instrument

Source of truth: `docs/specs/SPEC.ui-precision-instrument.md` §4 (frozen decisions). Rationale: `docs/audits/ui-critique-2026-11-18.md`.

Mode: **Operate**. World: **Precision instrument**. One accent, one type system, one spacing scale. State reads through a glyph or word plus color, never color alone. No new font or runtime dependency.

## Palette

Tokens are the only color source. Components consume `var(--token)`; no hardcoded hex in inline styles.

| Role | Token | Value |
|---|---|---|
| Canvas | `--ink-900` | `#0B0D0E` |
| Panel | `--ink-850` | `#111417` |
| Raised / input well | `--ink-800` | `#171B1F` |
| Control face | `--ink-700` | `#20262B` |
| Hairline | `--line` | `#2B3338` |
| Strong rule | `--line-strong` | `#3A444B` |
| Primary text | `--text` | `#E8ECEA` |
| Secondary text | `--text-dim` | `#9AA5A6` |
| Faint / label | `--text-faint` | `#667276` |
| Signal (only accent) | `--signal` | `#F2B14A` |
| Signal wash | `--signal-wash` | `rgba(242,177,74,.12)` |
| OK | `--ok` | `#5BD1A0` |
| Warning | `--warn` | `#E8C15A` |
| Danger | `--danger` | `#F2685E` |

## Type

- Labels: system UI stack, 11px, uppercase, `0.08em` tracking, `--text-faint`.
- Body/controls: 12px, `--text`.
- Emphasis: 13px, weight 600, one weight step per row maximum.
- Numbers: `ui-monospace, 'SF Mono', 'Cascadia Code', 'Roboto Mono', monospace`, `font-variant-numeric: tabular-nums`, 12px, `--text`. Applies to coordinates, dimensions, counts, revision, FPS.
- No new font dependency.

## Space and size

- Scale: 4 / 8 / 12 / 24px only.
- Control heights: 24px icon action, 28px input, 32px panel header, 40px toolbar.
- Collapse 5px and 6px one-offs to the nearest step.

## Rules

1. `--signal` appears only on active tool or active mode/segmented control, selected outliner row, active tab underline, and focus ring.
2. Every interactive control gets a 2px `--signal` focus ring at 2px offset. Never `outline: none` without a replacement.
3. State uses glyph or word plus color: lock, visibility, conflict, dirty/save.
4. One local 16px stroke icon component at 1.5px stroke replaces emoji and Unicode glyphs in chrome.
5. Floating bar uses the same palette, caps its width, moves shortcut text into `title` tooltips, and collapses to icons below 1280px.
6. Status bar accepts `isDirty`; when dirty it shows a warning glyph and "Unsaved changes" instead of a permanent green "Saved" dot.
7. Motion: 120ms ease-out state changes, 180ms panel collapse, disabled under `prefers-reduced-motion`.
8. Touched files contain no hardcoded fallback hex in inline styles.

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

`--color-text-muted` resolves to `--text-faint` (#667276), which is darker than `--color-text-secondary` / `--text-dim` (#9AA5A6). The previous scale was inverted. The `--spacing-*` names are legacy compatibility aliases and keep their original values: `--spacing-lg` 16px, `--spacing-xl` 24px, `--spacing-xxl` 32px. The new 4 / 8 / 12 / 24 scale lives in `--space-1`..`--space-4` and component usage.
