# Subspec G — Slice g-0: Layout Types

**Source:** `docs/specs/subs/SUBSPEC-G_UI_INTERACTION.md` §2.1 (Layout types)
**Constraint:** Pure TypeScript, zero framework/browser/Node/Three.js/MCP imports.

## Goal

Create UI layout type definitions: PanelConfig, WorkspaceLayout, PanelId. These are pure types — no UI framework imports.

## Files

| File | Action | Content |
|------|--------|---------|
| `packages/ui/src/layout-types.ts` | create | `PanelConfig`, `WorkspaceLayout`, `PanelId` type definitions |

## Types / APIs

```ts
export type PanelConfig = {
  id: string;
  position: 'left' | 'right' | 'bottom' | 'floating';
  width?: number;
  height?: number;
  collapsed: boolean;
  docked: boolean;
  order: number;
};

export type WorkspaceLayout = {
  panels: PanelConfig[];
  viewportDominant: boolean;   // viewport always gets remaining space
  savedLayouts: Record<string, PanelConfig[]>;
  activeLayout: string;
};

export type PanelId = 'hierarchy' | 'inspector' | 'viewport' | 'bottom-dock' | 'toolbar';
```

Layout rules (G1):
- Initial proportions: left hierarchy 260px, center viewport dominant, right inspector 320px, bottom dock 220px
- Panels resizable, collapsible, dockable
- Layout persisted across sessions
- "Restore default layout" resets to initial proportions
- Viewport remains dominant element
- Layout versioning: each saved layout includes version number; on version mismatch, migrate or reset to default
- Layout validation: panel sizes clamped to min/max; invalid layouts reset to default
- Minimum panel size: 120px width, 80px height
- Viewport must always have at least 400×300 pixels

## Acceptance criteria

1. `PanelConfig` has id, position ('left'|'right'|'bottom'|'floating'), optional width/height, collapsed, docked, order
2. `WorkspaceLayout` has panels array, viewportDominant boolean, savedLayouts record, activeLayout string
3. `PanelId` is 'hierarchy' | 'inspector' | 'viewport' | 'bottom-dock' | 'toolbar'
4. Panel width/height must be positive integers when specified
5. Minimum panel size: 120px width, 80px height
6. Viewport minimum: 400×300 pixels
7. `packages/ui` imports only from `@easyschemedit/domain` (no framework/browser/Node/Three.js/MCP)
8. Layout versioning: saved layouts include version; on mismatch, migrate or reset to default

## Tests

No test file yet — type definitions only. Verification via typecheck. Test file `slice-g-0-layout.test.ts` to be created with test harness.

## Verification

- `pnpm --filter @easyschemedit/ui exec tsc --noEmit` exit code 0
