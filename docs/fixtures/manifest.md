# Real Fixtures Manifest

This manifest documents all real, user-provided schematic fixtures in `fixtures/real/` per `docs/goal/GOAL.md` (§FIXTURES AND EVIDENCE) and `docs/plans/e2e-rebuild/index.md` (§2 and §5 slice E0.2).

## Non-Negotiable Rules
- **No synthetic files labelled real**: Never generate synthetic fixtures and place them in `fixtures/real/` or label them real in this manifest. Synthetic test fixtures used for unit testing must live inside package `__tests__/` and be explicitly identified as synthetic.
- **Blocked on missing fixtures**: Tests requiring real fixtures (e.g. `packages/formats/__tests__/slice-e1-2-fixtures.test.ts`) must check for fixture presence. If missing, they print `BLOCKED (awaiting fixture)` and exit 0, never reporting false green.
- **Format specification note on vanilla structure `.nbt`**: The vanilla structure `.nbt` format expected is the standard Mojang Structure Template format (used by in-game Structure Blocks and saved under `data/structures/`), containing Compound root with `DataVersion` (TAG_Int), `size` (TAG_List of 3 TAG_Ints: [x, y, z]), `palette` (TAG_List of Compound block state definitions) or `palettes` (list of lists), `blocks` (TAG_List of Compounds with `pos` [3 ints], `state` [int index into palette], and optional `nbt`), and `entities`.

---

## Fixture Inventory

| Filename | Format | Provenance | Size (bytes) | Checksum (SHA-256) | Expected Properties | Test Coverage |
|---|---|---|---|---|---|---|
| `README.md` | Markdown documentation | Repository documentation (`fixtures/real/README.md`) | 423 | `24721bce90cc80aa8124cfbb2947e703669d9496744af1d9f1de3c087c3ed7b3` | Instructions for dropping real schematic files | N/A (Doc) |
| `sponge_v3_sample.schem` *(placeholder)* | Sponge Schematic v3 (`.schem`) | User upload (WorldEdit / Sponge Minecraft 1.20+) | *Pending* | *Pending* | DataVersion, Version 3, Schematics compound, single or multi-layer palette, Data byte array | `slice-e1-2-fixtures.test.ts` — `PENDING USER UPLOAD (BLOCKED)` |
| `multi_region_sample.litematic` *(placeholder)* | Litematica (`.litematic`) | User upload (Litematica mod, multi-region with negative sizes) | *Pending* | *Pending* | Metadata, Version 5 or 6, Multiple Regions (≥2), negative size dimensions (`EnclosingSize` negative coords), bit-packed `BlockStates` longs | `slice-e1-2-fixtures.test.ts` — `PENDING USER UPLOAD (BLOCKED)` |
| `legacy_sample.schematic` *(placeholder)* | Legacy MCEdit / WorldEdit (`.schematic`) | User upload (pre-flattening Minecraft ≤1.12) | *Pending* | *Pending* | Width, Height, Length, `Blocks` byte array, `Data` byte array, legacy numeric block IDs | `slice-e1-2-fixtures.test.ts` (import error rejection / detection) — `PENDING USER UPLOAD (BLOCKED)` |
| `structure_template_sample.nbt` *(placeholder)* | Vanilla Minecraft Structure Template (`.nbt`) | User upload (Minecraft Java Structure Block save) | *Pending* | *Pending* | DataVersion, `size` [x, y, z], `palette` (block names + properties), `blocks` (pos, state, nbt), `entities` | `slice-e1-2-fixtures.test.ts` — `PENDING USER UPLOAD (BLOCKED)` |
| `large_build_sample.*` *(placeholder, optional)* | Sponge v3 or Litematica (≥1M blocks) | User upload (benchmark build) | *Pending* | *Pending* | Volume ≥ 1,000,000 non-air blocks for memory and rendering stress tests | Phase 0 Gate 4 benchmark (`memory-benchmarks.md`) — `PENDING USER UPLOAD (BLOCKED)` |

---

## Update Protocol

When dropping new real fixtures into `fixtures/real/`:
1. Calculate exact file size in bytes: `(Get-Item fixtures/real/<file>).Length`
2. Calculate SHA-256 checksum: `Get-FileHash -Algorithm SHA256 fixtures/real/<file>`
3. Inspect metadata / dimensions using `packages/formats` inspect utilities or NBT tools.
4. Record actual filename, format, source tool, size, sha256, and expected properties in the table above.
5. Update test status from `PENDING USER UPLOAD (BLOCKED)` to `PASSING` once verified in `slice-e1-2-fixtures.test.ts`.
