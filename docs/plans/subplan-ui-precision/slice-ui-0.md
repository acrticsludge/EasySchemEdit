# Slice ui-0 — Token foundation and design artifacts

## Goal

Establish the Precision-instrument tokens, record the design decisions, and provide the shared icon component that the two restyle slices consume.

## Constraints and non-goals

- No visual restyle of panels beyond the global background and focus-ring rule.
- No new dependency, no font package.
- Preserve all existing CSS custom-property names as aliases so untouched code keeps rendering.

## Inputs

- `docs/specs/SPEC.ui-precision-instrument.md` §4 (frozen design decisions)
- `apps/web/src/editor/design-tokens.css`
- `apps/web/src/layouts/BaseLayout.astro`

## Steps

1. Create `PRODUCT.md` and `DESIGN.md` at repo root. Record mode (Operate), the Precision-instrument world, the full palette table, type scale, space scale, and the eight rules from spec §4. These are the design source of truth; keep them factual, no marketing copy.
2. Rewrite the `:root` block of `design-tokens.css` with the tokens from spec §4. Keep every existing `--color-bg-*`, `--color-text-*`, `--color-accent*`, `--color-error*`, `--color-warning`, `--color-success`, `--color-conflict-*`, and `--spacing-*` name as an alias pointing at the new tokens. Fix the inverted text scale: `--color-text-muted` must not be lighter than `--color-text-secondary`.
3. Add to `design-tokens.css`, scoped under `.editor-workspace`:
   - `.editor-workspace :focus-visible { outline: 2px solid var(--signal); outline-offset: 2px; }`
   - `@media (prefers-reduced-motion: reduce)` removing transitions under `.editor-workspace`.
   - Update scrollbar colors to the new line/ink tokens.
4. Update `BaseLayout.astro` global styles to `--ink-900` background, `--text` color, and the system UI stack. Do not change the service-worker script.
5. Create `apps/web/src/editor/ui/Icon.tsx`: one component, prop `name` (string union) and optional `size = 16`. Render inline SVG, `viewBox="0 0 16 16"`, `fill="none"`, `stroke="currentColor"`, `strokeWidth={1.5}`, `strokeLinecap="round"`, `strokeLinejoin="round"`. Export the name union type. Geometry must be simple and legible at 16px; use basic `path`, `line`, `rect`, `circle`, `polyline` elements only. Include at least these names: `undo`, `redo`, `import`, `export`, `bake`, `save`, `projects`, `select`, `move`, `box`, `layers`, `conflict`, `history`, `agent`, `eye`, `eyeOff`, `lock`, `unlock`, `duplicate`, `trash`, `rotate`, `flip`, `grid`, `close`, `check`, `warning`, `chevronLeft`, `chevronRight`, `chevronDown`, `chevronUp`.
6. Create `apps/web/src/editor/ui/index.ts` re-exporting `Icon` and its name type.

## Output format and acceptance

- Files changed listed in the subagent report.
- `pnpm typecheck` exit 0.
- Every legacy token name still resolves (grep the token file for all names used in `apps/web/src/editor`).
- No hardcoded hex outside the token file and `DESIGN.md` table in touched files.
- `Icon.tsx` exports a typed name union and renders no emoji.

## Background

Baseline is green (master @ `ed3ae24`). The current token file mixes new aliases with hardcoded hex fallbacks in every component; this slice makes the token file authoritative before any component is touched.
