# Subspec G — Slice g-16: Acceptance Criteria Verification

**Source:** `docs/specs/subs/SUBSPEC-G_UI_INTERACTION.md` §8.2 (acceptance criteria, revised)
**Constraint:** Pure TypeScript, zero framework/browser/Node/Three.js/MCP imports.
**Research:** `docs/research/subplan-g.md` (G-6.1..G-6.4).
**Depends on:** all g-0..g-15.

## Goal

Verify all 21 SUBSPEC-G §8.2 acceptance items against the implemented modules. This is a meta-test that imports every g-slice and checks the acceptance criteria are met.

## Files

| File | Action | Content |
|------|--------|---------|
| `packages/ui/__tests__/slice-g-16-acceptance.test.ts` | create | All 21 acceptance items |
| `packages/ui/src/index.ts` | (no change) | already exports everything |

## Verification

- `tsc --noEmit` for `packages/ui`: exit 0
- Test command above: exit 0