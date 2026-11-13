# Subspec G — Slice g-5: Outliner

**Source:** `docs/specs/subs/SUBSPEC-G_UI_INTERACTION.md` §6.2 (Outliner, G2)
**Constraint:** Pure TypeScript, zero framework/browser/Node/Three.js/MCP imports.
**Research:** `docs/research/subplan-g.md` (G-6.1..G-6.4).
**Depends on:** slice g-0 (layout model), slice g-1 (shortcuts).

## Goal

Implement the outliner as executable pure logic: import groups that expand/collapse, placement rows exposing visibility/lock/name/dimensions/conflict, drag-to-reorder affecting precedence, multi-select with bulk operations, and a context menu whose actions are validated against lock state. "Top of outliner = highest priority" is a property of the order array, not a rendering detail.

## Files

| File | Action | Content |
|------|--------|---------|
| `packages/ui/src/outliner.ts` | create | `createOutliner`, import groups, row model, reorder, multi-select, context menu, conflict indicator |
| `packages/ui/__tests__/slice-g-5-outliner.test.ts` | create | Expand/collapse, rows, reorder (mouse + keyboard), multi-select, bulk ops, context menu, precedence |
| `packages/ui/src/index.ts` | update | re-export |

## Key rules

- Import groups expand/collapse; a collapsed group hides its placements but does not remove them.
- Placement rows expose: visibility toggle, lock icon, name, dimensions (width×height×depth), conflict indicator (none/clean/same-state/state).
- Drag-to-reorder affects precedence: index 0 = highest priority ("Top wins").
- Keyboard reorder: Alt+Up / Alt+Down moves the selection.
- Multi-select: shift-click range, ctrl/cmd-click toggle; bulk operations apply to the selected set.
- Context menu actions are gated by lock state: a locked placement cannot be transformed/edited/deleted/duplicated/baked/origin-changed; read/export allowed; hide/show allowed.
- Precedence is visually obvious: the outliner renders top-to-bottom = highest-to-lowest priority.

## Acceptance criteria

1. `createOutliner` accepts import groups with placements; groups expand/collapse.
2. Placement rows expose visibility, lock, name, dimensions, conflict indicator.
3. Drag reorder changes the precedence order (index 0 = highest).
4. Keyboard reorder (Alt+Up/Down) moves the selection.
5. Multi-select supports shift-range and ctrl-toggle.
6. Bulk operations (visibility, lock, delete) apply to the selected set.
7. Context menu lists the spec's actions and gates them by lock state.
8. A collapsed group hides its placements from the flat list but keeps them in the model.
9. Precedence order is a stable, inspectable array.

## Tests

`packages/ui/__tests__/slice-g-5-outliner.test.ts`

```
cd packages/ui
node --experimental-strip-types __tests__/slice-g-5-outliner.test.ts
```

## Verification

- `tsc --noEmit` for `packages/ui`: exit 0
- Test command above: exit 0