# Subspec G — Slice g-15: Accessibility

**Source:** `docs/specs/subs/SUBSPEC-G_UI_INTERACTION.md` §6.7 (accessibility), §8.2 item 17
**Constraint:** Pure TypeScript, zero framework/browser/Node/Three.js/MCP imports.
**Research:** `docs/research/subplan-g.md` (G-6.1..G-6.4).
**Depends on:** slice g-3 (design tokens for contrast).

## Goal

Implement accessibility as executable pure logic: keyboard navigation model, focus management, reduced motion preference, non-color indicators, contrast verification (WCAG 2.2 AA), touch targets (minimum 24px).

## Files

| File | Action | Content |
|------|--------|---------|
| `packages/ui/src/accessibility.ts` | create | `createAccessibility`, focus management, reduced motion, contrast check |
| `packages/ui/__tests__/slice-g-15-accessibility.test.ts` | create | Keyboard nav, focus, reduced motion, contrast, touch targets |
| `packages/ui/src/index.ts` | update | re-export |

## Key rules

- Keyboard navigation: tab order, focus trapping in dialogs, skip links.
- Reduced motion: respect prefers-reduced-motion.
- Non-color indicators: icons + text for status, not color alone.
- Contrast: WCAG 2.2 AA (4.5:1 normal text, 3:1 large text).
- Touch targets: minimum 24px (WCAG 2.5.8).

## Acceptance criteria

1. `createAccessibility` accepts a reduced-motion preference.
2. Focus management: push/pop focus stack, trap focus in dialogs.
3. Reduced motion disables animations.
4. Contrast check: returns pass/fail for a given pair.
5. Touch target check: minimum 24px.
6. Non-color indicator: icon + text required for status.

## Tests

`packages/ui/__tests__/slice-g-15-accessibility.test.ts`

```
cd packages/ui
node --experimental-strip-types __tests__/slice-g-15-accessibility.test.ts
```

## Verification

- `tsc --noEmit` for `packages/ui`: exit 0
- Test command above: exit 0