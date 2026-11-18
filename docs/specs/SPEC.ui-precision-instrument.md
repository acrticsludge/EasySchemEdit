# SPEC — Precision-Instrument UI Direction

Date: 2026-11-18
Status: approved for implementation
Source audit: `docs/audits/ui-critique-2026-11-18.md`

## 1. GOAL

Restyle the EasySchemEdit editor from an undifferentiated dark dashboard into a coherent "precision instrument" interface: one accent, one type system, one spacing scale, and state that reads without relying on color alone, with no change to editor behavior or data.

## 2. CONSTRAINTS AND NON-GOALS

### Constraints

- Surface mode is **Operate** (visitor completes a task). Expression is precision and restraint, not spectacle.
- Preserve the five-region shell and every existing behavior: toolbar actions, resizable/collapsible docks, outliner selection, inspector transforms, viewport bar, bottom tabs, status data.
- Tokens are the only color source. Components consume `var(--token)`; no hardcoded hex in inline styles in touched files.
- No new runtime dependency, no new font package, no framework change.
- Pure TypeScript in `packages/*` stays untouched. Changes are confined to `apps/web/src/**` plus design docs.
- Accessibility floor: visible focus ring on every interactive control; state never encoded by color alone; text contrast at least 4.5:1 for body and 3:1 for micro-labels.
- Baseline is green and must remain green: `pnpm typecheck` exit 0, `pnpm test` 105/105, web build exit 0.

### Non-goals

- Login view, first-project modal, MCP connect modal, project dialogs, import/export dialogs.
- The landing page is a redirect; it gets no redesign.
- No behavior change, no new editor feature, no data-model change.
- No motion beyond interaction feedback; no decorative animation.
- No commit. Staging and committing stay with the user unless explicitly asked.

## 3. INPUTS

| Path | Role |
|---|---|
| `docs/audits/ui-critique-2026-11-18.md` | Evidence, scores, and the direction this spec freezes |
| `apps/web/src/editor/design-tokens.css` | Token source of truth; base reset |
| `apps/web/src/editor/layout/WorkspaceShell.tsx` | Shell frame, dividers, collapse bars |
| `apps/web/src/editor/layout/Toolbar.tsx` | Brand, file actions, tools, overlays, auth |
| `apps/web/src/editor/layout/OutlinerPanel.tsx` | Placement list, visibility/lock/duplicate/delete |
| `apps/web/src/editor/layout/InspectorPanel.tsx` | Name, position, origin, rotation, mirror, stats, actions |
| `apps/web/src/editor/layout/BottomDock.tsx` | Tabs and default tab bodies |
| `apps/web/src/editor/layout/StatusBar.tsx` | Coordinates, tool, revision, save state, FPS |
| `apps/web/src/editor/viewport/SelectedPlacementBar.tsx` | Floating selected-placement actions |
| `apps/web/src/layouts/BaseLayout.astro` | Global dark background |
| `apps/web/src/islands/EditorIsland.tsx` | Call site; source of `isDirty`, `isSaving`, FPS, overlays |

## 4. DESIGN DECISIONS (frozen)

### Palette

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

The existing semantic aliases (`--color-bg-*`, `--color-text-*`, `--color-accent*`, `--color-error*`, `--color-warning`, `--color-success`, `--color-conflict-*`, `--spacing-*`) stay as aliases to the new tokens so untouched code keeps working. `--color-text-muted` must no longer be lighter than `--color-text-secondary`.

### Type

- Labels: system UI stack, 11px, uppercase, `0.08em` tracking, `--text-faint`.
- Body/controls: 12px, `--text`.
- Emphasis: 13px, weight 600, one weight step per row maximum.
- Numbers: `ui-monospace, 'SF Mono', 'Cascadia Code', 'Roboto Mono', monospace`, `font-variant-numeric: tabular-nums`, 12px, `--text`. Applies to coordinates, dimensions, counts, revision, FPS.
- No new font dependency.

### Space and size

- Scale: 4 / 8 / 12 / 24px only.
- Control heights: 24px icon action, 28px input, 32px panel header, 40px toolbar.
- Collapse 5px and 6px one-offs to the nearest step.

### Rules

1. `--signal` appears only on active tool or active mode/segmented control, selected outliner row, active tab underline, and focus ring.
2. Every interactive control gets a 2px `--signal` focus ring at 2px offset. Never `outline: none` without a replacement.
3. State uses glyph or word plus color: lock, visibility, conflict, dirty/save.
4. One local 16px stroke icon component at 1.5px stroke replaces emoji and Unicode glyphs in chrome.
5. Floating bar uses the same palette, caps its width, moves shortcut text into `title` tooltips, and collapses to icons below 1280px.
6. Status bar accepts `isDirty`; when dirty it shows a warning glyph and "Unsaved changes" instead of a permanent green "Saved" dot.
7. Motion: 120ms ease-out state changes, 180ms panel collapse, disabled under `prefers-reduced-motion`.
8. Touched files contain no hardcoded fallback hex in inline styles.

## 5. STEPS

| Slice | Deliverable |
|---|---|
| `ui-0` | Design artifacts (`PRODUCT.md`, `DESIGN.md`), token foundation, base background, local icon component |
| `ui-1` | Shell chrome: `WorkspaceShell`, `Toolbar`, `StatusBar`, `BottomDock` |
| `ui-2` | Data surfaces: `OutlinerPanel`, `InspectorPanel`, `SelectedPlacementBar` |
| `ui-3` | Verification gate: typecheck, build, tests, visual review at 1440/1280/1024 |

Dependencies: `ui-0` → `ui-1` and `ui-2` (parallel) → `ui-3`.

## 6. OUTPUT FORMAT AND ACCEPTANCE CHECK

### Per slice

- Goal, files changed, and behavioral invariants in the slice plan.
- No behavior change: all existing tests pass unchanged.
- No new hardcoded hex in touched files.

### Final acceptance

1. `pnpm typecheck` exit 0.
2. `pnpm test` reports 105/105 PASS.
3. `pnpm --filter @easyschemedit/web build` exit 0.
4. Visual check in a real browser at 1440px, 1280px, and 1024px: no overflow in the floating bar, no invisible text, visible focus rings, and the single accent appears only where the spec allows.
5. `git diff` reviewed; no changes to untracked user files (`.agents/`, fixtures, local schematic files).

Record the observed result of every check in `docs/agent/progress.md`. Never write "verified" without pasting the command and its result.

## 7. BACKGROUND

The audit scored the current UI 2.1/5. The five-region shell and the floating selected-placement concept are worth keeping; the generic styling, three competing blues, inverted text scale, missing focus rings, and always-true "Saved" indicator are not. The taste skill's contribution is the direction-first constraint: one world, one accent, reject anything that does not serve measurement. Impeccable contributes the craft floor and the rule that verification means looking at the rendered result, not just reading a diff.
