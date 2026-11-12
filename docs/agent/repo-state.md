# Repo State (GOAL.md §PHASE 0 step 5)

## Repository
- Root: `C:/Anubhav/Web Dev Projects/EasySchemEdit/`
- Remote: `https://github.com/acrticsludge/EasySchemEdit` (branch `master`)
- Commit: `32ab14a`

## What exists

### Specs (`docs/specs/subs/`)
- `SUBSPEC-A_DOMAIN_MODEL.md`
- `SUBSPEC-B_FILE_FORMATS.md`
- `SUBSPEC-C_PROJECT_PERSISTENCE.md`
- `SUBSPEC-D_EDITING_ENGINE.md`
- `SUBSPEC-E_RENDERING_RESOURCE_PACKS.md`
- `SUBSPEC-F_MCP_ADAPTER.md`
- `SUBSPEC-G_UI_INTERACTION.md`
- `SUBSPEC-H_ARCH_PHASES_RELEASE.md`
- `CROSS_DOCUMENT_CONSISTENCY.md`
- `SPEC.updated.md`
- `refrences/` — 11 reference PNG images

### Plans (`docs/plans/`)
- `subplan-a/index.md` + 22 slice files (slice-0 through slice-14 plus 0.5, 2.5, 5.5, 6.5, 8.5, 8.6, 8.7)
- `subplan-b/index.md` + 15 slice files (slice-b-0 through slice-b-14)
- `goal/GOAL.md` — this project master plan

### Implementation code
- `packages/domain/` — fully implemented, 21 test files, tsc clean, all tests pass
  - types.ts, nbt.ts, volume.ts, coordinates.ts, volume-api.ts, block-state.ts, block-state-string.ts, block-state-transforms.ts, placement.ts, effective-block.ts, ancillary-transforms.ts, bounds.ts, chunk-codec.ts, nbt-codec.ts, validation.ts, worker-protocol.ts, archive.ts, acceptance.ts, error-codes.ts, shared-types.ts
- `packages/formats/` — fully implemented, 14 test files, tsc clean, all tests pass
  - types.ts, adapter.ts, reports.ts, nbts.ts, format-detection.ts, errors.ts, inspect.ts, legacy-id-table.ts (+ .source.md), sponge-v2.ts, sponge-v3.ts, litematic.ts, litematic-packed.ts, litematic-size.ts, region-eligibility.ts, export-semantics.ts, snapshot-types.ts, vanilla-nbt.ts

### Not yet created
- `packages/assets/` — planned for slice b-13 (asset pipeline: manifest -> version JSON -> client JAR, IndexedDB cache, ASSET_* codes, first-run panel, CORS gate)
- `docs/agent/progress.md` — progress log (GOAL.md OUTPUT HABITS)
- `docs/research/<subspec>/` — research gate docs for C-H
- `docs/fixtures/manifest.md` — fixture manifest
- `docs/audits/<subspec>-round-N.md` — audit outputs

## Package names
- `@easyschemedit/domain` — `packages/domain/`
- `@easyschemedit/formats` — `packages/formats/`
- `@easyschemedit/assets` — planned, `packages/assets/` (not yet created)

## Constraints
- Zero Three.js/React/DOM/UI imports in `packages/domain` and `packages/formats`
- `CHUNK_SIZE = 16`, not user-overridable
- Voxel index: `index = (cy * 16 + cz) * 16 + cx`, length 4096
- Palette index 0 = `CANONICAL_AIR`
- `bigint` for NBT `long` and `longArray`
- Mirror-before-rotation transform order
- `manifest.checksums` is single source of truth
- No auto-split; refuse dimension >65,535 with `EXPORT_DIMENSION_LIMIT`
- Legacy `.schematic` and vanilla `.nbt` via convert-on-import
- No credentials, API keys, or secrets in any files
