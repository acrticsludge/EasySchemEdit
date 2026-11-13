# Subspec G — Slice g-6: Inspector

**Source:** `docs/specs/subs/SUBSPEC-G_UI_INTERACTION.md` §6.3 (Inspector, G3)
**Constraint:** Pure TypeScript, zero framework/browser/Node/Three.js/MCP imports.
**Research:** `docs/research/subplan-g.md` (G-6.1..G-6.4).
**Depends on:** slice g-0 (layout), slice g-5 (outliner selection).

## Goal

Implement the inspector as executable pure logic: context-sensitive to the active tool/selection, always exposing origin and transform for a selected placement, numeric inputs with direct typing + steppers, integer-only position, half-integer origin, rotation in 0/90/180/270, mirror None/X/Z, searchable block picker, property editor from versioned block-state metadata, unknown properties as raw key/value, recently-used blocks, project-wide palette, data-fidelity warnings adjacent to affected controls.

## Files

| File | Action | Content |
|------|--------|---------|
| `packages/ui/src/inspector.ts` | create | `createInspector`, context sensitivity, placement inspector, numeric inputs, block picker, property editor, warnings |
| `packages/ui/__tests__/slice-g-6-inspector.test.ts` | create | Context sensitivity, origin/transform, numeric inputs, rotation, mirror, block picker, properties, warnings |
| `packages/ui/src/index.ts` | update | re-export |

## Key rules

- Contextual to active tool/selection: when nothing is selected, the inspector shows tool defaults; when a placement is selected, it shows that placement.
- Selected placement inspector always exposes origin and transform.
- Numeric inputs: direct typing + steppers (both available).
- Position X/Y/Z: integer-only block inputs.
- Origin: integer and half-integer inputs.
- Rotation: 0°, 90°, 180°, 270°.
- Mirror: None / X / Z.
- Block picker: searchable namespaced IDs.
- Property editor generated from versioned block-state metadata.
- Unknown properties visible as raw key/value.
- Recently used blocks and project-wide palette.
- Data fidelity warnings adjacent to affected controls.

## Acceptance criteria

1. `createInspector` accepts a context (tool + selection) and produces a view model.
2. When a placement is selected, origin and transform are always exposed.
3. Position inputs accept integers only; origin accepts integers and half-integers.
4. Rotation is constrained to 0/90/180/270.
5. Mirror is one of None/X/Z.
6. Block picker searches namespaced IDs.
7. Property editor renders known properties from metadata and unknown as raw key/value.
8. Recently used blocks and palette are tracked.
9. Data fidelity warnings are attached to affected controls.
10. Numeric inputs support both direct typing and steppers.

## Tests

`packages/ui/__tests__/slice-g-6-inspector.test.ts`

```
cd packages/ui
node --experimental-strip-types __tests__/slice-g-6-inspector.test.ts
```

## Verification

- `tsc --noEmit` for `packages/ui`: exit 0
- Test command above: exit 0