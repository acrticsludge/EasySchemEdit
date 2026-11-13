# Subspec G — Slice g-4: Layout Implementation

**Source:** `docs/specs/subs/SUBSPEC-G_UI_INTERACTION.md` §3.1 (layout flow), §4.1 (layout validation), §6.1 (main workspace layout, G1)
**Constraint:** Pure TypeScript, zero framework/browser/Node/Three.js/MCP imports. Pointer events arrive as normalised `{ x, y }` descriptors; layout state mutates through explicit commands.
**Research:** `docs/research/subplan-g.md` G-6.1 … G-6.4.
**Depends on:** slice g-0 (`packages/ui/src/layout-types.ts` — `createDefaultLayout`, `resolveLayout`, `validateLayout`, `saveLayout`, `loadLayout`, `restoreDefaultLayout`).

## Goal

Implement the layout *behaviour* that g-0 deliberately left as data: resizing a panel by dragging its separator, collapsing and restoring it, rearranging bottom tabs, and persisting named layouts — all through one resolver so clamping, the viewport floor and the schema version stay enforced.

## Files

| File | Action | Content |
|------|--------|---------|
| `packages/ui/src/layout.ts` | create | `createLayoutController` plus `resizePanel`, `collapsePanel`, `expandPanel`, `toggleCollapse`, `dockPanel`, `undockPanel`, `reorderTabs`, `resetLayout`, `saveNamedLayout`, `loadNamedLayout`, `deleteNamedLayout`, `renameLayout` |
| `packages/ui/__tests__/slice-g-4-layout-impl.test.ts` | create | Resize, collapse/expand, dock/undock, reorder, persistence, floor, reset |
| `packages/ui/src/index.ts` | update | re-export |

## Types / APIs

```ts
export type LayoutController = {
  state(): WorkspaceLayout;
  resizePanel(id: string, delta: { width?: number; height?: number }, window: WindowSize): void;
  collapsePanel(id: string, window?: WindowSize): void;
  expandPanel(id: string, window?: WindowSize): void;
  toggleCollapse(id: string, window?: WindowSize): void;
  dockPanel(id: string, window?: WindowSize): void;
  undockPanel(id: string, window?: WindowSize): void;
  reorderTabs(order: string[]): void;
  saveNamedLayout(name: string): SavedLayoutEnvelope;
  loadNamedLayout(name: string): boolean;
  deleteNamedLayout(name: string): boolean;
  renameLayout(from: string, to: string): boolean;
  resetLayout(): void;
  isCollapsed(id: string): boolean;
  visiblePanelIds(): string[];
  bottomTabs(): string[];
};

export function createLayoutController(initial?: WorkspaceLayout, window?: WindowSize): LayoutController;
```

Key rules:

- Every mutation routes through `resolveLayout`, so a resize that would starve the viewport (below 400×300) is clamped rather than applied, and the side panels absorb the shrink.
- A collapsed panel contributes 0 to the viewport subtraction, so collapsing a side panel visibly widens the viewport.
- Docking/undocking toggles the `docked` flag; undocked panels are treated as floating and do not reserve space.
- `reorderTabs` only reorders panel ids that exist; unknown ids are dropped and the result is stable.
- Named layouts live inside `savedLayouts`; `resetLayout` restores the G1 default without deleting saved layouts.
- A controller never mutates its input layout; it clones first.
- `reorderTabs` on a layout with no bottom dock does nothing (nothing to reorder).

## Acceptance criteria

1. `resizePanel('hierarchy', { width: +20 }, window)` increases the width by 20, clamped to the 120 floor.
2. A resize that would push the viewport below 400px is clamped so the viewport stays at 400px.
3. `collapsePanel` sets `collapsed: true`; the collapsed panel contributes 0 width/height to the viewport subtraction.
4. `expandPanel` restores the panel to its last known size (or the default) if it was collapsed.
5. `toggleCollapse` flips the state and is idempotent in pairs.
6. `dockPanel` / `undockPanel` toggle `docked`.
7. `reorderTabs` changes the `order` of bottom-dock panels and drops unknown ids.
8. `saveNamedLayout` + `loadNamedLayout` round-trip a named layout; `loadNamedLayout` returns false for an unknown name.
9. `deleteNamedLayout` refuses to delete the active layout and the default layout.
10. `renameLayout` refuses to clobber an existing name.
11. `resetLayout` restores the G1 proportions without deleting saved layouts.
12. No mutation touches the input layout passed to `createLayoutController`.
13. The controller never produces a layout that fails `validateLayout`.

## Tests

`packages/ui/__tests__/slice-g-4-layout-impl.test.ts`

```
cd packages/ui
node --experimental-strip-types __tests__/slice-g-4-layout-impl.test.ts
```

## Verification

- `tsc --noEmit` for `packages/ui`: exit 0
- Test command above: exit 0