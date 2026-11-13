# Subspec G — Slice g-8: Conflict Navigation

**Source:** `docs/specs/subs/SUBSPEC-G_UI_INTERACTION.md` §6.2 (conflict panel), §6.4 (Conflicts tab)
**Constraint:** Pure TypeScript, zero framework/browser/Node/Three.js/MCP imports.
**Research:** `docs/research/subplan-g.md` (G-6.1..G-6.4).
**Depends on:** slice g-0 (layout), slice g-5 (outliner), slice g-7 (status bar).

## Goal

Implement conflict navigation as executable pure logic: a conflict list with owner info and severity (red/yellow), navigation to a conflict with a smooth camera fly (no camera jump on hover), and the camera-fly animation state machine (start → in-flight → arrived). Hovering a conflict highlights it without moving the camera.

## Files

| File | Action | Content |
|------|--------|---------|
| `packages/ui/src/conflict-nav.ts` | create | `createConflictNavigator`, conflict list, fly-to, hover highlight |
| `packages/ui/__tests__/slice-g-8-conflict-nav.test.ts` | create | Conflict list, fly-to, hover no-move, animation state |
| `packages/ui/src/index.ts` | update | re-export |

## Key rules

- Conflicts have id, region, owner, severity (red/yellow), and a target position.
- Hovering a conflict sets `hoveredId` but does NOT change the camera.
- Clicking "navigate" starts a camera fly (state: idle → flying → arrived).
- The fly has a duration and a progress value (0..1).
- Cancelling mid-flight returns to idle without applying the target.
- Arriving applies the target camera position.
- The conflict list is sorted by severity (red first) then by region.

## Acceptance criteria

1. `createConflictNavigator` accepts a conflict list.
2. Hovering sets `hoveredId` without changing the camera.
3. `navigateTo(id)` starts a fly (state becomes 'flying').
4. Fly progress advances from 0 to 1; on arrival state becomes 'arrived' and camera is set.
5. `cancelFly()` aborts mid-flight without applying the target.
6. Conflicts sorted by severity (red before yellow) then region.
7. `resolveConflict(id)` removes it from the list.
8. Empty list → no conflicts, no fly possible.

## Tests

`packages/ui/__tests__/slice-g-8-conflict-nav.test.ts`

```
cd packages/ui
node --experimental-strip-types __tests__/slice-g-8-conflict-nav.test.ts
```

## Verification

- `tsc --noEmit` for `packages/ui`: exit 0
- Test command above: exit 0