# Subspec G — Slice g-0: Layout Types + Layout Model

**Source:** `docs/specs/subs/SUBSPEC-G_UI_INTERACTION.md` §2.1 (Layout types), §3.1 (layout flow), §4.1 (layout validation), G1, G-4
**Constraint:** Pure TypeScript, zero framework/browser/Node/Three.js/MCP imports. Persistence is serialization only — the caller supplies the storage.
**Research:** `docs/research/subplan-g.md` decisions G-6.1 … G-6.4.
**Second pass (2026-11-13):** the original slice was types-only, and `packages/ui` did not exist at all. This slice creates the package and delivers the layout model as executable logic.

## Goal

Create `packages/ui` and implement the workspace layout model: the G1 panel set and proportions, size clamping, structural validation, a resolver that repairs what is repairable and resets what is not, and versioned persistence that rejects an unknown schema version instead of half-applying it.

## Files

| File | Action | Content |
|------|--------|---------|
| `packages/ui/package.json` | create | `@easyschemedit/ui`, same build/typecheck/test conventions as the other packages |
| `packages/ui/tsconfig.json` | create | `allowImportingTsExtensions` + `noEmit`, sources typechecked (tests run under Node) |
| `packages/ui/src/layout-types.ts` | create | Layout types, G1 constants, `createDefaultLayout`, `validateLayout`, `clampPanelSize`, `resolveLayout`, `saveLayout`, `loadLayout`, `restoreDefaultLayout` |
| `packages/ui/src/index.ts` | create | public API |
| `packages/ui/__tests__/slice-g-0-layout.test.ts` | create | 74 assertions |

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

`packages/ui/__tests__/slice-g-0-layout.test.ts` — 74 assertions, 0 failures.

```
cd packages/ui
node --experimental-strip-types __tests__/slice-g-0-layout.test.ts
```

Covers: G1 constants and proportions; default layout independence; positive-integer and floor validation with named reasons; duplicate/unknown panel ids; clamping; `resolveLayout` repair-versus-reset; the viewport floor under proportional shrink; an `overflow` flag below the G-4 1024×768 minimum (verified across a 10-size window sweep); version-envelope round-trip; unknown-version, corrupt, and absent state all resetting to default; named-layout independence; restore-default not mutating its input.

## Verification

- `node <tsc> --noEmit` for `packages/ui`: exit 0
- `node --experimental-strip-types __tests__/slice-g-0-layout.test.ts`: exit 0 (74 passed, 0 failed)
- Registered in the root `typecheck` script so the package is covered by the repo-wide check
