# Subspec A — Domain Model: Slice Plan

**Source:** `docs/specs/subs/SUBSPEC-A_DOMAIN_MODEL.md`
**Constraint:** `packages/domain` must have **zero** imports of framework, browser, Node, Three.js, or MCP packages. Pure TypeScript only.

## Method

Build in thin vertical slices per the incremental-implementation skill:
- Implement → Test → Verify → Commit → Next slice
- Each slice changes one logical thing
- Project must build and existing tests pass after each increment

## Slices

| Slice | Focus | Deliverable | Tests |
|-------|-------|-------------|-------|
| `slice-0.md` | Project init + core types | `packages/domain/types.ts` | `halfToCoord`/`coordToHalf` inverses; `CHUNK_SIZE` = 16 |
| `slice-0.5.md` | Shared types + error-code registry | `packages/domain/shared-types.ts`, `packages/domain/error-codes.ts` | Error code shape; type exports |
| `slice-1.md` | NBT AST (12 tag kinds) | `packages/domain/nbt.ts` | All tag kinds round-trip; `bigint` preserved |
| `slice-2.md` | Chunk/volume storage | `packages/domain/volume.ts` | Index formula; array length exactly 4096 |
| `slice-2.5.md` | Volume API | `packages/domain/volume-api.ts` | `getBlock`/`setBlock`/`fill`/`iterateNonAir` |
| `slice-3.md` | Negative-coordinate chunk mapping | `packages/domain/coordinates.ts` | Floor division sign combinations |
| `slice-4.md` | Transform math (center-based) | `packages/domain/coordinates.ts` | Round-trip invariants (7) + expected-output tests |
| `slice-5.md` | BlockStateId canonicalization + equality | `packages/domain/block-state.ts` | Value-based equality |
| `slice-5.5.md` | Block-state string parse/format | `packages/domain/block-state-string.ts` | `minecraft:oak_stairs[facing=north,half=bottom]` |
| `slice-6.md` | BlockStateTransformRegistry (bijective table) | `packages/domain/block-state-transforms.ts` | Chirality test; facing verified against R matrix |
| `slice-6.5.md` | More orientation handlers | `packages/domain/block-state-transforms.ts` | `rotation`, side props, `face`+`facing`, chest `type`, rail `ascending`/`curved` |
| `slice-7.md` | Lattice-safe block mapping | `packages/domain/coordinates.ts` | Counterexample classified off-grid; integer-only origin |
| `slice-8.md` | Placement + Project types + invariants | `packages/domain/placement.ts`, `packages/domain/project.ts` | All invariants halt commit |
| `slice-8.5.md` | Effective-block resolver | `packages/domain/effective-block.ts` | Top-wins/bottom-wins; tombstones as erase contributions |
| `slice-8.6.md` | Ancillary transforms | `packages/domain/ancillary-transforms.ts` | Block entity/entity/biome/tick transforms |
| `slice-8.7.md` | Bounds/vector helpers | `packages/domain/bounds.ts` | Union/intersect/contains/size/translate |
| `slice-9.md` | Binary chunk codec | `packages/domain/chunk-codec.ts` | Round-trip with SHA-256; magic bytes test |
| `slice-10.md` | NBT binary codec | `packages/domain/nbt-codec.ts` | DataView endianness; modified UTF-8; null byte + emoji |
| `slice-11.md` | Validation rules | `packages/domain/validation.ts` | Mixed-type lists; off-grid rejection |
| `slice-12.md` | Worker ownership / immutable snapshots | `packages/domain/worker-protocol.ts` | Explicit cancel message; progress result |
| `slice-13.md` | Archive serialization + manifest checksums | `packages/domain/archive.ts` | Deterministic bytes; absolute caps |
| `slice-14.md` | Full acceptance criteria | `packages/domain/__tests__/` | All criteria incl. items 5, 6, 11, 12 |

## Acceptance Criteria (from SUBSPEC-A §13.2, updated)

1. `Vec3Half` stores origin as integer half-block units; `halfToCoord`/`coordToHalf` are exact inverses
2. `CHUNK_SIZE` exported as `16`, not user-overridable in v1
3. Voxel index formula: `index = (cy * 16 + cz) * 16 + cx`; length exactly 4096
4. Negative-coordinate floor division: `-1→chunk -1/local 15`, `-16→chunk -1/local 0`, `-17→chunk -2/local 15`
5. Palette index array type follows A6 thresholds; index 0 = `CANONICAL_AIR`; all-air chunks omitted; per-chunk palette max 4096 entries
6. `cave_air`/`void_air` preserved as distinct entries; `structure_void` is owning
7. `BlockStateId` equality is value-based
8. `Transform` uses integer `translation`, integer-only `origin` (even half-block components), mirror-before-rotation; fractional `translation` rejected with `ENGINE_OFF_GRID_TRANSFORM`
9. All seven round-trip invariants pass under property-based testing
10. Vanilla rotation/mirror table tested for facing, axis, stair shape, rail shape, hinge, door/trapdoor orientation (rotation does NOT change stair/hinge)
11. Unknown modded blocks preserved exactly; strict mode refuses, permissive warns
12. NBT AST preserves all tag kinds, `bigint` longs, compound insertion order; rejects mixed-type lists
13. Palette entries unique; every index < palette.length; nonAirCount matches actual count; tombstone positions inside bounds; origin even components; all-air chunks omitted
14. Zero-size/empty placements allowed (EMPTY_VOLUME/DIMENSION code, not INTEGER_OVERFLOW)
15. Block-state string parse/format round-trips with canonical ordering
16. Deterministic archive bytes: same project twice = identical bytes
17. Worker results committed only if `project.revision` matches `baseRevision`

## Removed/Changed Spec Text

The following SUBSPEC-A statements are superseded by the slices:
- "Origin supports integer and half-integer coordinates" (A2) → Origin is integer-only for placement transforms
- Mirror-X/Y rotation tables in §4.2 (stair/hinge rows) → Rotation does NOT change stair/hinge; only mirror swaps left/right
- `checksums.json` reference → `manifest.checksums` is single source of truth (handled in cross-doc sync)
