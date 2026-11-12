# Subspec A — Slice 14: Full Acceptance Criteria

**Goal:** Write the complete test suite validating all acceptance criteria from SUBSPEC-A §13.2, plus property-based tests for transforms and operation bounds.

## Files to Create/Modify

| File | Purpose |
|------|---------|
| `packages/domain/__tests__/index.test.ts` | Test runner aggregating all slice tests |
| `packages/domain/__tests__/acceptance.test.ts` | Acceptance criteria validation |

## Acceptance Criteria Tests

1. `Vec3Half` stores origin as integer half-block units; `halfToCoord`/`coordToHalf` exact inverses
2. `CHUNK_SIZE` exported as `16`, not user-overridable
3. Voxel index formula: `index = (cy * 16 + cz) * 16 + cx`; length exactly 4096
4. Negative-coordinate floor division: `-1→chunk -1/local 15`; `-16→chunk -1/local 0`; `-17→chunk -2/local 15`
5. Palette index array type follows A6 thresholds; index 0 = `CANONICAL_AIR`; all-air chunks omitted
6. `cave_air`/`void_air` preserved as distinct entries; `structure_void` is owning
7. `BlockStateId` equality is value-based
8. `Transform` uses integer `translation`, integer-only `origin` (even half-block components), mirror-before-rotation; fractional rejected
9. All seven round-trip invariants pass under property-based testing
10. Vanilla rotation/mirror table tested for facing, axis, stair shape, rail shape, hinge, door/trapdoor orientation (rotation does NOT change stair/hinge)
11. Unknown modded blocks preserved exactly; transform warnings/refusal based on strict/permissive mode
12. NBT AST preserves all tag kinds, `bigint` longs, compound insertion order; rejects mixed-type lists
13. Palette entries unique; every index < palette.length; nonAirCount matches actual count; tombstone positions inside bounds; origin even components; all-air chunks omitted
14. Zero-size/empty placements allowed (EMPTY_VOLUME/DIMENSION code, not INTEGER_OVERFLOW)
15. Block-state string parse/format round-trips with canonical ordering
16. Deterministic archive bytes: same project twice = identical bytes
17. Worker results committed only if `project.revision` matches `baseRevision`

## Property-Based Test Strategy

Use fast-check or similar for transforms:
- Random translations, rotations, mirrors → verify round-trip invariants hold for all combinations
- Verify no epsilon drift in `halfToCoord`/`coordToHalf`
- Verify `placementWorldBounds` contains every mapped block

## Additional Tests Required

- Rotation/mirror expected-output tests: 1x1x3 bar at origin [0,0,0] rotated 90/180/270; mirror x/z
- Stair/hinge chirality: rotation preserves stair shape/hinge; mirror swaps left/right; mirror twice = identity
- Modified UTF-8: null byte as `C0 80`; emoji as surrogate pair
- DataView endianness: big-endian reads match expected byte order
- Hostile NBT: deep nesting, huge declared length → typed decoder errors
- Zero-size placement: EMPTY_VOLUME code, not INTEGER_OVERFLOW
- Deterministic archive bytes: same project twice = identical bytes

## Verification Checklist

- [ ] All acceptance criteria items 5, 6, 11, 12 covered (previously unimplemented)
- [ ] Rotation/mirror expected-output tests added
- [ ] Stair/hinge chirality test added
- [ ] Modified UTF-8 test added
- [ ] DataView endianness test added
- [ ] Hostile NBT test added
- [ ] Zero-size placement test added
- [ ] Deterministic archive bytes test added
- [ ] fast-check property suite (random translation/rotation/mirror/origin/cell) asserting round-trips AND `placementWorldBounds` contains every mapped block
- [ ] TypeScript compiles without errors
- [ ] All tests pass
- [ ] Change committed with descriptive message

## Completion

After Slice 14, SUBSPEC-A (Domain Model) is complete and ready for review. All type definitions, formulas, and acceptance tests from SUBSPEC-A §13.2 are implemented and verified.
