# Slice p2-0 — Token foundation and full-surface unification

## Goal

Raise palette separation and migrate every remaining editor component to tokens so the app reads as one system.

## Constraints and non-goals

- Owns `apps/web/src/editor/design-tokens.css` and the 15 files listed in spec §3. Does not touch the 7 styled shell components or the design docs.
- No layout changes in these 15 files. This slice is a color/style-token migration only.
- No new component, dependency, font, or feature.

## Inputs

- `docs/specs/SPEC.ui-dense-tool.md` §4 (frozen palette, type, density)
- `apps/web/src/editor/design-tokens.css`
- The 15 component files in spec §3

## Steps

1. Update `:root` in `design-tokens.css` to the pass-2 values in spec §4. Keep every legacy alias name and its original meaning. Add `--space-0h: 2px`. Keep the focus ring, reduced-motion block, and themed scrollbars.
2. Add themed browser surfaces under `.editor-workspace`: `::selection { background: var(--signal); color: var(--ink-900); }` and `caret-color: var(--signal)` on inputs.
3. In each of the 15 component files, replace every hardcoded hex with the closest token. Preserve layout values (px sizes, gaps, radii) exactly. Do not rename functions, props, handlers, or aria-labels.
4. Keep semantic colors semantic: error → `--danger`, warning → `--warn`, success → `--ok`, accent/blue → `--signal`. The three different old blues all become `--signal`.
5. Grep `apps/web/src/editor/**/*.tsx` for hex; only `design-tokens.css` may contain hex.

## Output format and acceptance

- List files changed and run `pnpm typecheck`; paste verbatim result.
- No hardcoded hex in the 15 files.
- No behavior or layout change in the 15 files.

## Background

The 15 files held 865 hardcoded hex values and were the reason the blue asset button, amber folder labels, and purple viewport grid survived pass 1.
