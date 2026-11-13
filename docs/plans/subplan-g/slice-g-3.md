# Subspec G — Slice g-3: Design Tokens + Contrast Verification

**Source:** `docs/specs/subs/SUBSPEC-G_UI_INTERACTION.md` §1.5 (design tokens, contrast-verified table), "Visual acceptance criteria"
**Constraint:** Pure TypeScript, zero framework/browser/Node/Three.js/MCP imports. Tokens are data plus the WCAG relative-luminance math; CSS emission is a string.
**Research:** `docs/research/subplan-g.md` G-6.1.

## Goal

Turn the spec's token table into queryable data with a real WCAG 2.2 relative-luminance implementation, so contrast is **computed** rather than asserted in prose. The slice then verifies every foreground/background pair the UI actually uses — not only the pairs the spec's table happened to list.

## What the verification found (2026-11-13)

Running the real math against the spec's own table:

1. **Every stated ratio in §1.5 is wrong**, though every token still passes its requirement. Examples: `--color-text-primary` is claimed "~14:1" and measures **16.16:1**; `--color-error` is claimed "~7.4:1" and measures **5.16:1**; `--color-border` is claimed "~4.6:1" and measures **6.82:1**; `--color-text-secondary` is claimed "~5.6:1" and measures **8.17:1**. The claimed `--color-bg-primary` luminance (~0.018) measures **0.004**.
2. **A genuine AA failure the table does not catch:** §1.5 verifies only against `--color-bg-primary`. `--color-error` (`#ef4444`) used as **text** on `--color-bg-tertiary` (`#252525`, the hovered/active surface) measures **4.07:1**, below the 4.5:1 normal-text requirement. The palette is dark-surface-heavy, so error text on a hovered row is a normal state, not a corner case.

**Resolution (does not overwrite a locked decision):** `--color-error` keeps its value and its component/3:1 use. This slice adds `--color-error-text: #f94e4e`, the minimal lightening of the same hue that clears 4.5:1 on the *tertiary* surface (4.55:1), for error text on raised/hovered surfaces. The discrepancy is logged as DOUBTS D-9 for the spec owner.

## Files

| File | Action | Content |
|------|--------|---------|
| `packages/ui/src/design-tokens.ts` | create | Token table, `relativeLuminance`, `contrastRatio`, `verifyTokenContrast`, `requiredContrastFor`, `toCssCustomProperties` |
| `packages/ui/__tests__/slice-g-3-design-tokens.test.ts` | create | Token presence, computed ratios, the full fg×bg matrix, spacing scale |
| `packages/ui/src/index.ts` | update | re-export |

## Types / APIs

```ts
export type TokenName = `--${string}`;
export type ColorTokens = Record<TokenName, string>;
export type SpacingTokens = Record<TokenName, string>;

export const COLOR_TOKENS: Readonly<ColorTokens>;
export const SPACING_TOKENS: Readonly<SpacingTokens>;

/** WCAG 2.2 relative luminance of an sRGB hex colour (0 = black, 1 = white). */
export function relativeLuminance(hex: string): number;
/** WCAG 2.2 contrast ratio between two hex colours (1..21). */
export function contrastRatio(a: string, b: string): number;

export type ContrastRequirement = 'normal-text' | 'large-text' | 'component';
export function requiredContrastFor(kind: ContrastRequirement): number;  // 4.5 | 3 | 3

export type ContrastResult = {
  foreground: TokenName;
  background: TokenName;
  ratio: number;
  required: number;
  pass: boolean;
};
export function verifyTokenContrast(
  pairs: ReadonlyArray<{ fg: TokenName; bg: TokenName; kind: ContrastRequirement }>,
  tokens?: ColorTokens,
): ContrastResult[];

export function toCssCustomProperties(tokens?: ColorTokens): string;
```

Key rules:

- Ratios are computed with the WCAG 2.2 definition: linearise each sRGB channel (`c/12.92` below 0.04045, else `((c+0.055)/1.055)^2.4`), weight by `0.2126/0.7152/0.0722`, then `(Lmax+0.05)/(Lmin+0.05)`.
- Thresholds are 4.5:1 normal text, 3:1 large text and UI components.
- The token table is the spec's values verbatim, plus `--color-error-text` (added above) — nothing else changes.
- `verifyTokenContrast` reports every pair with its ratio and verdict, so a failing pair is visible rather than absent.

## Acceptance criteria

1. Every color token in §1.5 exists with its exact spec value, and the spacing scale is 4/8/12/16/24/32.
2. `relativeLuminance('#000000') === 0` and `relativeLuminance('#ffffff') === 1` (within 1e-9).
3. `contrastRatio('#000000', '#ffffff') === 21` (within 1e-9).
4. `contrastRatio(x, x) === 1` for any colour, and the function is symmetric.
5. The computed ratios match the values in this slice's "What the verification found" section (text-primary 16.16, text-secondary 8.17, border 6.82, border-hover 9.27, accent 7.06, error 5.16, warning 10.13, success 8.53 against bg-primary).
6. Every text token meets 4.5:1 on **all three** surfaces except `--color-error` on `--color-bg-tertiary`, which is a documented failure.
7. `--color-error-text` meets 4.5:1 on all three surfaces, replacing `--color-error` for error text.
8. Every component token (borders, accent) meets 3:1 on all three surfaces.
9. `verifyTokenContrast` returns one result per pair and flags the known failure rather than omitting it.
10. `toCssCustomProperties` emits `--name: value;` lines that round-trip through a simple parse.

## Tests

`packages/ui/__tests__/slice-g-3-design-tokens.test.ts` — 112 assertions, 0 failures.

```
cd packages/ui
node --experimental-strip-types __tests__/slice-g-3-design-tokens.test.ts
```

Covers: every spec token's exact value; the conflict-token aliases; the six-step spacing scale; luminance anchors (black 0, white 1, mid-grey ≈0.216); the 21:1 black-on-white ratio; symmetry and the 1:1 self-ratio; the threshold table; the nine computed ratios pinned to the values recorded above; the single known text failure reported (not hidden); `--color-error-text` clearing 4.5:1 on all three surfaces and staying a pure-hue red; every component pair at 3:1; CSS emission and its round-trip; an injected failing palette being detected with its real ratio.

## Verification

- `tsc --noEmit` for `packages/ui`: exit 0
- `node --experimental-strip-types __tests__/slice-g-3-design-tokens.test.ts`: exit 0 (112 passed, 0 failed)