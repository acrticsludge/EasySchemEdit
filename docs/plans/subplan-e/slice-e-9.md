# Subspec E — Slice e-9: Hover Rendering Overlay

**Source:** `docs/specs/subs/SUBSPEC-E_RENDERING_RESOURCE_PACKS.md` §3.7 (Hover rendering overlay layer)
**Constraint:** Pure TypeScript, zero Three.js/React/DOM/UI imports. Imports from `@easyschemedit/domain` via relative paths only.

## Goal

Implement hover rendering types: HoverTarget, HoverOverlay, HoverInfoHUD, SameTypeHighlight. These are pure type definitions for hover block highlight, info HUD data, and same-type highlight.

## Files

| File | Action | Content |
|------|--------|---------|
| `packages/renderer/src/hover.ts` | create | `HoverTarget`, `HoverOverlay`, `HoverInfoHUD`, `SameTypeHighlight`, `HoverEngine` types |

## Types / APIs

```ts
export type HoverTarget = {
  position: Vec3i;            // world block coordinate
  placementId: string;        // owning placement
  localPosition: Vec3i;       // local block coordinate within placement
  blockState: BlockStateId;   // block state at hover position
  isAir: boolean;             // true if air (no hover target)
};

export type HoverOverlay = {
  highlightedPosition: Vec3i | null;  // single hovered block cell
  lineBuffer: any[];              // wireframe line buffer (one cell = 12 lines)
  isDirty: boolean;               // needs regeneration when hover target changes
  renderPriority: number;         // lower priority than selection borders
};

export type HoverInfoHUD = {
  worldPosition: Vec3i;
  blockStateId: string;
  properties: Record<string, string>;
  owningPlacementId: string;
  contributors: Array<{ placementId: string; blockState: BlockStateId }>; // for overlapping placements
};

export type SameTypeHighlight = {
  enabled: boolean;
  targetState: BlockStateId | null;
  highlightedPositions: Vec3i[];  // all blocks matching target state
  dimmed: boolean;                // dimmer line buffer than primary hover
};

export type HoverEngine = {
  hoverTarget: HoverTarget | null;
  overlay: HoverOverlay;
  infoHUD: HoverInfoHUD | null;
  sameTypeHighlight: SameTypeHighlight;
  setHoverTarget(target: HoverTarget | null): void;
  updateOverlay(target: HoverTarget | null): void;
  updateInfoHUD(target: HoverTarget | null): void;
  toggleSameTypeHighlight(enabled: boolean): void;
  clear(): void;
};
```

Key rules:
- Single hovered block cell is outlined at a time
- Rendered as wireframe/outline that does not obscure block surface
- Resolved through placement's inverse transform for rotated/mirrored placements
- Does not render through opaque geometry; air blocks have no hover target
- Batched into single small line buffer (one cell = 12 lines)
- Throttled to 30Hz max
- Same-type highlight uses second dimmer line buffer

## Acceptance criteria

1. `HoverTarget` has position, placementId, localPosition, blockState, isAir
2. `HoverOverlay` has highlightedPosition, lineBuffer, isDirty, renderPriority
3. `HoverInfoHUD` has worldPosition, blockStateId, properties, owningPlacementId, contributors
4. `SameTypeHighlight` has enabled, targetState, highlightedPositions, dimmed
5. `HoverEngine` has hoverTarget, overlay, infoHUD, sameTypeHighlight, setHoverTarget, updateOverlay, updateInfoHUD, toggleSameTypeHighlight, clear
6. Single hovered block cell only
7. Air blocks have no hover target (isAir = true, no overlay)
8. Same-type highlight highlights all blocks matching target state
9. Same-type highlight invalidated only when selection, hover target, or block states change

## Tests

No test file yet — type definitions only. Verification via typecheck. Test file `slice-e-9-hover.test.ts` to be created with test harness.

## Verification

- TypeScript compiles clean for `packages/renderer`
