# Subspec E — Slice e-2: Missing Model Fallback

**Source:** `docs/specs/subs/SUBSPEC-E_RENDERING_RESOURCE_PACKS.md` §2.3 (Missing model fallback)
**Constraint:** Pure TypeScript, zero Three.js/React/DOM/UI imports. Three.js types abstracted as `any`.

## Goal

Implement missing model fallback types: MissingModelFallback with magenta-and-black checkerboard cube geometry, unlit material, and thin outline. These are pure type definitions — no Three.js imports.

## Files

| File | Action | Content |
|------|--------|---------|
| `packages/renderer/src/missing-model.ts` | create | `MissingModelFallback` type definition |

## Types / APIs

```ts
export type MissingModelFallback = {
  geometry: any;       // THREE.BufferGeometry — magenta-and-black checkerboard cube (abstracted)
  material: any;       // THREE.Material — unlit, no culling (abstracted)
  outline: any;        // THREE.LineSegments — thin outline (abstracted)
};
```

Key rules:
- `geometry` is a cube with magenta (#FF00FF) and black (#000000) checkerboard pattern
- `material` is unlit (no lighting calculations), no face culling (double-sided)
- `outline` is a thin line-segments outline around the cube edges
- Used when base assets haven't loaded yet OR for genuinely missing blocks/textures

## Acceptance criteria

1. `MissingModelFallback` has geometry, material, outline fields
2. All fields are `any` type (Three.js abstracted) — no Three.js imports
3. Missing model fallback used when base assets not loaded (all blocks render with fallback)
4. Missing model fallback used for genuinely missing blocks/textures after assets loaded
5. Persistent warning banner with "Load assets" action shown until assets load

## Tests

No test file yet — type definitions only. Verification via typecheck. Test file `slice-e-2-missing-model.test.ts` to be created with test harness.

## Verification

- TypeScript compiles clean for `packages/renderer`
