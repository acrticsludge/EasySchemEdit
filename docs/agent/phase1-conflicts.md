# Phase 1: Known Conflict Resolutions

Resolved per GOAL.md §PHASE 1. Each entry: decision + evidence, or DOUBTS.md entry.

## Conflict 1: A2 Vec3Half origin vs §3.4 rejecting half-integer origins

**Decision: RESOLVED** — Origin type is `Vec3Half` (supports half-integer storage for visual pivots), but block-cell mapping validation requires integral (even) half-block components. Half-integer origins are visual transform-gizmo pivots only; they are rejected with `ENGINE_OFF_GRID_TRANSFORM` for actual block mapping.

**Evidence:**
- SUBSPEC-A §1 A2 (locked): "Origin supports integer and half-integer coordinates. Stored as integer half-block units (Vec3Half, actual = stored / 2)."
- SUBSPEC-A §3.4: "If origin is half-integer... blocks are off-grid and rejected with ENGINE_OFF_GRID_TRANSFORM."
- SUBSPEC-A §3.4: "Half-integer origin (A2) is the visual pivot for the transform gizmo; block-cell mapping is defined on the snapped integer grid."
- `packages/domain/placement.ts` invariant #5 (line 120-121): rejects `origin[0] % 2 !== 0` with `NON_INTEGRAL_ORIGIN`.
- `packages/domain/coordinates.ts` `isLatticeSafe()` (line 112-117): returns false for non-even origin components.
- `packages/domain/__tests__/slice-4-transform.test.ts` tests 8 & 76-78: `isLatticeSafe` rejects half-integer origin `[0.5, 0, 0.5]`, accepts integral `[0,0,0]` and even `[2,4,6]`.

## Conflict 2: Define rotateAboutPoint precisely

**Decision: RESOLVED** — `rotateAboutPoint(placement, pivot, rotationY, mirror)` computes a new Transform where the world-space pivot `P` stays fixed under the new rotation/mirror. Math (doubled half-block units):

```
L2 = O + M_cur(R_cur⁻¹(P2 − T2_old))     // local coordinate of pivot under current transform
T2_new = P2 − R_new(M_new(L2 − O2))       // new translation keeping pivot fixed
```

Where `P2 = pivot` (already doubled), `T2_old = translation × 2`, `O2 = origin` (already doubled).

**Evidence:**
- `packages/domain/coordinates.ts` `rotateAboutPoint()` (lines 174-205): rewritten with correct math; added `applyRotationInverse()` helper.
- `packages/domain/__tests__/slice-4-transform.test.ts` test 13: pivot at block center `[21,1,21]` ([10.5,0.5,10.5]) stays fixed under 90° rotation — local block `[0,0,0]` maps to world `[10,0,10]` under both old and new transforms.
- Distinguishes rotation about placement's own origin (origin unchanged, translation adjusted) vs rotation about arbitrary world-space pivot (translation recomputed from pivot).

## Conflict 3: Single-entry Litematica palette minimum-2-bit rule

**Decision: RESOLVED** — `bitsPerEntry = max(2, ceil(log2(P)))`. Zero-bit palette is not used; minimum is 2 bits.

**Evidence:**
- `packages/formats/litematic-packed.ts`: `bitsPerEntry = Math.max(2, Math.ceil(Math.log2(paletteSize)))`.
- `packages/formats/__tests__/slice-b-3-packed-blockstates.test.ts`: tests palette sizes 1, 5, 12, 20, 300.
- Litematic `BlockStates` stored as `longArray` (TAG_LONG_ARRAY), not `list` — fixed per real file format.

## Conflict 4: Stair shape, door hinge, directional block-state transforms

**Decision: RESOLVED** — Verified per-property against the rotation matrix and mirror planes:
- Rotation does NOT change stair shape or door hinge (90°/180°/270° = unchanged).
- Mirror swaps stair shape left↔right and door hinge left↔right.
- Mirror twice = identity. 90°⁻¹ = 270°, 90°⁴ = identity.
- All transformations bijective; inverse restores original state.

**Evidence:**
- `packages/domain/block-state-transforms.ts`: `makeVanillaHandler()` implements correct table; `validateBijectivity()` verifies all properties.
- `packages/domain/__tests__/slice-6-block-state-transforms.test.ts`: bijectivity tests pass.
- Matches SUBSPEC-A §4.2 table exactly.

## Conflict 5: One canonical assets package and spec path

**Decision: RESOLVED** — `packages/assets` is the canonical assets package (planned, not yet created). `packages/asset-pipeline` does not exist. SUBSPEC-H covers asset pipeline architecture. Phase 2 will create slice plans under `docs/plans/subplan-c/` through `docs/plans/subplan-h/`.

**Evidence:**
- `docs/agent/repo-state.md`: `@easyschemedit/assets` planned at `packages/assets/` (not yet created).
- No `packages/asset-pipeline` directory exists.
- GOAL.md §PHASE 2: "Order: H architecture/build-system foundation FIRST, then C, D, E, F, G."

## Conflict 6: Decompression limits inside streaming

**Decision: RESOLVED** — Limits enforced incrementally inside the parser/decompressor, not after. Absolute caps from `maxDecompressedBytes` (max entry size, max total size, max entry count) plus ratio check only when compressed > 64 KiB. No 100:1 ratio rejection.

**Evidence:**
- `packages/formats/nbts.ts`: `gzipDecompress` enforces `maxDecompressedBytes` while inflating; `decodeNbtFromBytes` enforces depth/tag/string/array limits during parsing.
- `packages/formats/__tests__/slice-b-1-nbts.test.ts`: NBT safety limit tests pass.

## Conflict 7: Other proposals

| Proposal | Status | Evidence |
|----------|--------|----------|
| No auto-split; refuse dimension >65,535 with EXPORT_DIMENSION_LIMIT | RESOLVED | `packages/formats/export-semantics.ts`: `EXPORT_DIMENSION_LIMIT`, `MAX_DIMENSION = 65535` |
| Sponge v3 root "Schematic" with Blocks{Palette,Data} | RESOLVED | `packages/formats/sponge-v3.ts` |
| Sponge v2 root Palette+BlockData | RESOLVED | `packages/formats/sponge-v2.ts` |
| Litematic real structure (Metadata, Regions{...}) | RESOLVED | `packages/formats/litematic.ts` |
| Signed-Size normalization with per-axis dimensions | RESOLVED | `packages/formats/litematic-size.ts` |
| Stair/hinge change on mirror only | RESOLVED | Conflict 4 above |
| chunkViews keyed by placementId + chunkKey | RESOLVED | `packages/formats/snapshot-types.ts` |
| Ancillary data per placement | RESOLVED | `packages/domain/placement.ts` `PlacementAncillaryData` |
| Offset semantics (relative, not absolute) | RESOLVED | `packages/formats/sponge-v2.ts`, `sponge-v3.ts`: Offset is int[3], relative to paste point; to be verified with WorldEdit fixture |

## DOUBTS.md entries

None — all 7 Phase 1 conflicts resolved with evidence.

## Next step

Phase 2: Plan SUBSPEC-C..H slice plans (order: H foundation first, then C, D, E, F, G), following the A/B slice plan format.
