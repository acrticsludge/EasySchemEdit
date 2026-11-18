# UI critique — EasySchemEdit editor

Date: 2026-11-18
Surface: `apps/web/src/editor/**` (Operate mode — 3D schematic editor)
Method: Impeccable heuristic review; direction-filtered with the taste discipline (pick the world first, one accent, coherence, reject the rest).
Status: review only. No code changed.

## Verdict

**2.1 / 5 — functional, unfinished.** The layout solves the right problem: a dominant viewport with docked tools around it. Everything around that structure is default dark-dashboard styling. The comments claim an "S&box dark aesthetic" (`Toolbar.tsx:3`, `OutlinerPanel.tsx:3`), but the rendered language is system-font black-on-black with a stock blue accent. Polishing this surface in place would be wasted effort; it needs a direction first.

## Scores

| Dimension | Score | Evidence |
|---|---:|---|
| Visual hierarchy | 2 | `Toolbar.tsx:107-392` puts brand, file ops, undo/redo, tools, four overlay toggles, MCP, and auth in one 40px row separated only by 1px rules. No primary/secondary action distinction: Import, Export, Bake, Save, Projects all share `actionButtonStyle` (`:430`). |
| Typography | 2 | Base is a system stack at 13px (`design-tokens.css:80-82`). Sizes 10/11/12/13 are scattered with no scale. Uppercase micro-labels are inconsistent (`OUTLINER` `OutlinerPanel.tsx:153` vs `Overlays:` `Toolbar.tsx:283` vs `POS:` `StatusBar.tsx:58`). Numbers use monospace in the status bar but not in most inspector stats. |
| Color & contrast | 2 | Surfaces #0d0d0d / #1a1a1a / #252525 with #2a2a2a–#333 borders. `--color-text-muted` (#b3b3b3, `design-tokens.css:24`) is *lighter* than `--color-text-secondary` (#a8a8a8, `:23`) — the semantic scale is inverted. Three blues in play: token #4a9eff, hardcoded #3b82f6 (`SelectedPlacementBar.tsx:353`), #60a5fa (`index.astro:37`). |
| Spacing & rhythm | 2 | Row heights are 40 / 34 / 28 / 24 / 26px across sibling chrome with no shared scale. Spacing jumps between 2, 4, 5, 6, 8, 12, 16, 24, 32px. The floating bar uses 14px bottom offset and 5px padding against a 4px grid everywhere else. |
| Consistency & systems | 2 | Tokens exist but nearly every component hardcodes the fallback hex in inline styles, so there is no single source of truth. Two independent nudge implementations with separate state (`InspectorPanel.tsx:34`, `SelectedPlacementBar.tsx:28`). Icon language mixes emoji (📦 🧱 ⚠ ⏱ 🤖 👁 🔒) with Unicode glyphs (↺ ✥ ⎘ ⊞) and bare ASCII (▲ ▼). |
| Feedback & state clarity | 3 | Good bones: `aria-pressed`, `aria-selected`, disabled states, dirty asterisk, FPS threshold. But `StatusBar.tsx:112-122` always renders a green dot and "Saved" — it has no `isDirty` prop. Empty status text is #555 (`StatusBar.tsx:93`), effectively invisible. Error red appears only as text color on delete buttons. |
| Density & scanability | 3 | Dense tables suit a tool. The floating bar is the exception: roughly thirteen controls in one nowrap row (`SelectedPlacementBar.tsx:212-539`), including the long labels "Duplicate Side-by-Side (Ctrl+D)" and "Rotate 90° (E)". It will overflow a 1280px viewport once the viewport is narrowed by panels. |
| Identity / point of view | 1 | No recognizable design decision anywhere. The one distinctive element, the floating bar, uses a slate #1e1e26 / #3a3a4c palette unrelated to the neutral black shell, so it reads as pasted in rather than authored. |
| Accessibility | 2 | Inputs set `outline: 'none'` with no replacement focus ring (`OutlinerPanel.tsx:199`, `InspectorPanel.tsx:701`). 10px text at #666 on #0d0d0d fails contrast. Emoji icons carry aria-labels, which helps, but the visual encoding of lock/visibility is hue-only. Scrollbar is 6px (`design-tokens.css:55-65`). |
| Craft / polish | 2 | Transitions exist on a few controls at 0.1s; there is no motion rule. Empty states are plain centered text. `borderRadius: '0px'` is repeated on every control as a default rather than a decision. No visible hover treatment for rows or tabs beyond color swaps. |

## What is worth keeping

- The five-region shell: toolbar, left outliner, dominant viewport, bottom dock, status bar (`WorkspaceShell.tsx:241-434`). This is the correct information architecture for the task.
- Resizable dividers with `role="separator"` and collapse/expand controls (`WorkspaceShell.tsx:328-389`).
- The floating selected-placement bar as a concept. It puts the highest-frequency actions next to the object they act on. The problem is its styling and label length, not its existence.
- Tabular data in the inspector (position, origin, size, block counts). This is the raw material a precision-instrument look can build on.

## Direction: Precision instrument

Chosen from the Systemic/data family of the taste taxonomy, with no accent family. The reference object is a survey instrument or oscilloscope, not a game UI and not a marketing site. The visitor is measuring and placing blocks in a coordinate space; the interface should look like it measures things.

The discipline transfers from the taste skill like this: one world, one accent, every surface obeys the same rules, and anything that does not serve measurement gets cut. The angelcore palette does not transfer; it would fight an Operate-mode tool.

### Palette

One accent only. Semantic colors are states, never decoration, and never carry meaning alone.

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
| Signal (the only accent) | `--signal` | `#F2B14A` |
| Signal wash | `--signal-wash` | `rgba(242,177,74,.12)` |
| OK | `--ok` | `#5BD1A0` |
| Warning | `--warn` | `#E8C15A` |
| Danger | `--danger` | `#F2685E` |

Amber reads as an instrument readout and separates the tool from the default-blue dashboard category. Warning stays a distinct yellow and always ships with a glyph and a text label.

### Type

- Labels: system UI stack, 11px, uppercase, 0.08em tracking, `--text-faint`.
- Body / controls: 12px, `--text`.
- Emphasis: 13px, weight 600. Never more than one weight step per row.
- Numbers: `ui-monospace, 'SF Mono', 'Cascadia Code', 'Roboto Mono', monospace`, `font-variant-numeric: tabular-nums`, 12px, `--text`. Every coordinate, dimension, count, revision, and FPS value uses it.
- No new font dependency. The mono stack is a platform feature already available.

### Space

Four-step scale only: 4 / 8 / 12 / 24px. Control heights: 24px for dense icon actions, 28px for inputs, 32px for panel headers, 40px for the toolbar. Collapse the 5px and 6px one-offs into the nearest step.

### Rules

1. Accent appears in exactly four places: active tool, selected outliner row, active tab underline, focus ring. Nothing else is amber.
2. Every interactive element gets a 2px `--signal` focus ring at 2px offset. No `outline: none` without a replacement.
3. State is never color alone. Lock, visibility, conflict, and save state each get a glyph or word alongside the color.
4. Icons come from one local 16px stroke set at 1.5px, in a single component. Emoji and Unicode glyphs are retired from chrome.
5. The floating bar joins the same palette (ink-800 face, hairline border), drops "(Ctrl+D)" and "(E)" from visible labels into tooltips, and caps its width. It should shrink to icons on narrow viewports.
6. Status bar accepts `isDirty` and shows "Unsaved changes" in `--warn` with a glyph. No permanent green dot.
7. Motion: 120ms ease-out for state changes, 180ms for panel collapse, disabled under `prefers-reduced-motion`. No decorative animation.
8. Components consume tokens. Hardcoded fallback hexes in inline styles are removed so `design-tokens.css` is the only color source.

### Deliverables once approved

- `PRODUCT.md` and `DESIGN.md` capturing the mode, world, and rules above.
- Token refactor in `apps/web/src/editor/design-tokens.css`.
- Restyle of the shell, toolbar, outliner, inspector, dock, status bar, selected-placement bar, and the local icon component.
- Focus-ring and semantic-state pass across all touched controls.
- Verification: `pnpm typecheck`, `pnpm --filter @easyschemedit/web build`, then a real browser look at 1440px, 1280px, and 1024px before claiming the work is done.

## Out of scope

Login view, project dialogs, and import/export modals were not audited here. The landing page is a redirect (`index.astro:10`). If the direction is approved, those surfaces inherit the same tokens but get their own pass rather than a silent restyle.
