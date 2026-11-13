// packages/ui/src/design-tokens.ts
// Design tokens and WCAG 2.2 contrast verification (SUBSPEC-G §1.5).
//
// Pure TypeScript, zero framework/browser/Node/Three.js/MCP imports: tokens are data, ratios are
// arithmetic, and CSS is a string. Nothing here reads the DOM or computes styles.
//
// Why the maths lives in code: §1.5 states its ratios in prose ("~14:1", "~4.6:1") and every one of
// them is wrong, while every token still passes. Prose cannot be tested; a computed ratio can. The
// same computation also finds a real AA failure the prose table misses (see DOUBTS D-9).

// ============================================================================
// Types
// ============================================================================

export type TokenName = `--${string}`;
export type ColorTokens = Record<string, string>;

export type ContrastRequirement = 'normal-text' | 'large-text' | 'component';

export type ContrastResult = {
  foreground: TokenName;
  background: TokenName;
  ratio: number;
  required: number;
  pass: boolean;
};

export type ContrastPair = {
  fg: TokenName;
  bg: TokenName;
  kind: ContrastRequirement;
};

// ============================================================================
// Token table (SPEC-G §1.5, values verbatim)
// ============================================================================

/**
 * The spec's palette, unchanged. `--color-error-text` is the one addition: it is a text-safe
 * variant of `--color-error`, which as text on `--color-bg-tertiary` measures 4.07:1 and fails the
 * 4.5:1 normal-text requirement. Rather than alter a locked token value, the slice adds a token for
 * text on raised/hovered surfaces. Logged as DOUBTS D-9.
 */
export const COLOR_TOKENS: Readonly<ColorTokens> = Object.freeze({
  '--color-bg-primary': '#0d0d0d',
  '--color-bg-secondary': '#1a1a1a',
  '--color-bg-tertiary': '#252525',
  '--color-border': '#999999',
  '--color-border-hover': '#b3b3b3',
  '--color-text-primary': '#eaeaea',
  '--color-text-secondary': '#a8a8a8',
  // Decorative only: never the sole carrier of information (§1.5).
  '--color-text-muted': '#b3b3b3',
  '--color-accent': '#4a9eff',
  '--color-accent-hover': '#6ab0ff',
  '--color-error': '#ef4444',
  // Added: error *text* on raised/hovered surfaces (4.55:1 on bg-tertiary).
  '--color-error-text': '#f94e4e',
  '--color-warning': '#eab308',
  '--color-success': '#22c55e',
  '--color-conflict-clean': '#22c55e',
  '--color-conflict-same-state': '#eab308',
  '--color-conflict-state': '#ef4444',
});

export const SPACING_TOKENS: Readonly<ColorTokens> = Object.freeze({
  '--spacing-xs': '4px',
  '--spacing-sm': '8px',
  '--spacing-md': '12px',
  '--spacing-lg': '16px',
  '--spacing-xl': '24px',
  '--spacing-xxl': '32px',
});

/** The three surfaces every foreground token must be checked against. */
export const SURFACE_TOKENS: readonly TokenName[] = [
  '--color-bg-primary',
  '--color-bg-secondary',
  '--color-bg-tertiary',
];

/** Thresholds from WCAG 2.2 AA. */
export const REQUIRED_CONTRAST: Readonly<Record<ContrastRequirement, number>> = Object.freeze({
  'normal-text': 4.5,
  'large-text': 3,
  component: 3,
});

/** Text tokens that are used to convey information (so they need the 4.5:1 text threshold). */
const TEXT_TOKENS_FOR_VERIFICATION: readonly TokenName[] = [
  '--color-text-primary',
  '--color-text-secondary',
  '--color-text-muted',
  '--color-accent',
  '--color-error',
  '--color-error-text',
  '--color-warning',
  '--color-success',
];

/** Every text token against every surface. The known `--color-error` failure is included on purpose. */
export const TEXT_TOKEN_PAIRS: readonly ContrastPair[] = TEXT_TOKENS_FOR_VERIFICATION.flatMap((fg) =>
  SURFACE_TOKENS.map((bg) => ({ fg, bg, kind: 'normal-text' as const })),
);

/** Non-text UI tokens: borders and the accent fill, which need 3:1 against their surface. */
export const COMPONENT_TOKEN_PAIRS: readonly ContrastPair[] = [
  { fg: '--color-border', bg: '--color-bg-primary', kind: 'component' },
  { fg: '--color-border', bg: '--color-bg-secondary', kind: 'component' },
  { fg: '--color-border-hover', bg: '--color-bg-secondary', kind: 'component' },
  { fg: '--color-border-hover', bg: '--color-bg-tertiary', kind: 'component' },
  { fg: '--color-accent', bg: '--color-bg-primary', kind: 'component' },
  { fg: '--color-accent', bg: '--color-bg-secondary', kind: 'component' },
  { fg: '--color-accent-hover', bg: '--color-bg-tertiary', kind: 'component' },
];

// ============================================================================
// WCAG 2.2 relative luminance and contrast
// ============================================================================

function parseHex(hex: string): [number, number, number] {
  const value = hex.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(value) && !/^[0-9a-fA-F]{3}$/.test(value)) {
    throw new Error(`not a hex colour: ${hex}`);
  }
  const expanded =
    value.length === 3
      ? value
          .split('')
          .map((char) => char + char)
          .join('')
      : value;
  const r = parseInt(expanded.slice(0, 2), 16);
  const g = parseInt(expanded.slice(2, 4), 16);
  const b = parseInt(expanded.slice(4, 6), 16);
  return [r, g, b];
}

/** sRGB channel (0..255) → linear light (0..1), per the WCAG 2.2 definition. */
function linearize(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** WCAG 2.2 relative luminance: linearise, weight by the luminance coefficients. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex);
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

/**
 * WCAG 2.2 contrast ratio in the range 1..21. Symmetric: the order of the arguments does not matter,
 * because the formula always divides the lighter luminance by the darker one.
 */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

export function requiredContrastFor(kind: ContrastRequirement): number {
  return REQUIRED_CONTRAST[kind];
}

// ============================================================================
// Verification
// ============================================================================

/**
 * Verify each pair against its threshold. A failing pair is returned with `pass: false` rather than
 * dropped, so the caller can surface it — the whole point of computing instead of asserting.
 */
export function verifyTokenContrast(
  pairs: readonly ContrastPair[],
  tokens: ColorTokens = COLOR_TOKENS,
): ContrastResult[] {
  const results: ContrastResult[] = [];
  for (const pair of pairs) {
    const fg = tokens[pair.fg];
    const bg = tokens[pair.bg];
    if (fg === undefined || bg === undefined) {
      throw new Error(`unknown token in pair: ${pair.fg} / ${pair.bg}`);
    }
    const ratio = contrastRatio(fg, bg);
    const required = requiredContrastFor(pair.kind);
    results.push({
      foreground: pair.fg,
      background: pair.bg,
      ratio,
      required,
      pass: ratio >= required,
    });
  }
  return results;
}

/** Just the failures, for a diagnostics panel or a build-time assertion. */
export function contrastFailures(
  pairs: readonly ContrastPair[] = TEXT_TOKEN_PAIRS,
  tokens: ColorTokens = COLOR_TOKENS,
): ContrastResult[] {
  return verifyTokenContrast(pairs, tokens).filter((result) => !result.pass);
}

// ============================================================================
// CSS emission
// ============================================================================

/** Emit `--name: value;` lines for every token, in declaration order. */
export function toCssCustomProperties(
  tokens: ColorTokens = COLOR_TOKENS,
  spacing: ColorTokens = SPACING_TOKENS,
): string {
  const lines: string[] = [];
  for (const [name, value] of Object.entries(tokens)) lines.push(`${name}: ${value};`);
  for (const [name, value] of Object.entries(spacing)) lines.push(`${name}: ${value};`);
  return lines.join('\n');
}

/** A `:root { … }` block, ready to inject. */
export function toCssRootBlock(tokens: ColorTokens = COLOR_TOKENS): string {
  return `:root {\n${toCssCustomProperties(tokens)
    .split('\n')
    .map((line) => `  ${line}`)
    .join('\n')}\n}`;
}