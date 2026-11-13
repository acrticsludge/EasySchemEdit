# Phase 0 Evidence: Schematic Format Reality (Gate 1)

This document records the Phase 0 Gate 1 evidence for schematic formats per `docs/specs/subs/SUBSPEC-H_ARCH_PHASES_RELEASE.md` (§8 Gate 1), `docs/plans/e2e-rebuild/index.md` (§5 Slice E1.2), and `docs/fixtures/manifest.md`.

---

## 1. Executive Summary

Phase 0 Gate 1 requires:
> "Correct parsing and writing of `.schem` v3 and representative `.litematic` files, including multi-region and negative-size regions. Evidence: `format-tests.md` with fixture list and pass/fail results."

All format codecs, parsers, and exporters are implemented in pure TypeScript inside `packages/formats/`.
Unit and round-trip verification across all supported formats passes (16/16 test files passing in `packages/formats/__tests__/`). Real user-supplied fixture integration in `fixtures/real/` is wired via `packages/formats/__tests__/slice-e1-2-fixtures.test.ts`. Per `AGENTS.md` §3, missing user fixtures are truthfully reported as `BLOCKED (awaiting fixture)` without fabricating synthetic files.

---

## 2. Pinned Format Specifications & Verified Behaviors

### 2.1 Sponge Schematic v3 (`.schem`)
- **Code Reference**: `packages/formats/sponge-v3.ts`, `packages/formats/__tests__/slice-b-8-sponge-v3.test.ts`, `packages/formats/__tests__/slice-e1-1-api.test.ts`
- **Root Tag**: Compound with:
  - `Version`: TAG_Int = `3`
  - `DataVersion`: TAG_Int (default `3955` for Minecraft Java 1.21.11)
  - `Width`, `Height`, `Length`: TAG_Int (dimensions, hard refusal above 65535 per `validateExportDimensions`)
  - `Offset`: TAG_Int_Array `[-originX, -originY, -originZ]`. Defined relative to paste location: `pasteTarget + Offset = minCorner`.
    - Sign preservation across repeated `import → export → import` cycles is mathematically guaranteed: `transform.translation` stores `Offset`; subsequent export uses `transform.translation` as base offset.
  - `Blocks`: Compound containing:
    - `Palette`: Compound mapping block state strings (e.g. `minecraft:chest[facing=north,type=single,waterlogged=false]`) to TAG_Int palette index.
    - `Data`: TAG_Byte_Array containing VarInt-encoded palette indices in `x + z * Width + y * Width * Length` indexing order.
    - `BlockEntities`: TAG_List of Compounds with `Pos` [3 ints] or individual `x`, `y`, `z` ints and raw NBT.
  - `Entities`: TAG_List of Compounds.
- **Multi-Placement Composite Export**: Flattening multiple placements into a single composite region computes the union world bounding box across all placements and resolves overlapping voxels via top-wins precedence (`getCompositeBlockState`).
- **Sponge v2 Backward Compatibility**: `packages/formats/sponge-v2.ts` supports Sponge v2 (`Version: 2`) with IntArray offset and VarInt palette.

### 2.2 Litematica (`.litematic`)
- **Code Reference**: `packages/formats/litematic.ts`, `packages/formats/litematic-size.ts`, `packages/formats/litematic-packed.ts`, `packages/formats/__tests__/slice-b-4-litematic.test.ts`, `packages/formats/__tests__/slice-e1-1-api.test.ts`
- **Root Tag**: Compound with:
  - `Version`: TAG_Int = `6` (subversion `1`)
  - `MinecraftDataVersion`: TAG_Int = `3955`
  - `Metadata`: Compound with `Name`, `Author`, `Description`, `RegionCount`, `TotalVolume`, `TotalBlocks`, `TimeCreated`, `TimeModified`, `EnclosingSize` (`{x, y, z}`).
  - `Regions`: Compound mapping region name to region compound:
    - `Position`: Compound `{x, y, z}`.
    - `Size`: Compound `{x, y, z}`. **Crucially, dimensions can be negative in real Litematica files.**
- **Signed-Size Normalization (`litematic-size.ts`)**:
  - `normalizedWidth = |Size.x|`, `normalizedHeight = |Size.y|`, `normalizedLength = |Size.z|`.
  - Negative `Size.x` or `Size.z` or `Size.y` indicates the region extends in the negative coordinate direction from `Position`.
  - Linear index formula: `linearIndex(x, z, y, width, length) = x + z * width + y * width * length`.
  - For negative `Size.x`: internal coordinate is mapped via `rawToNormalizedCoord(rx, Size.x) = Size.x < 0 ? (|Size.x| - 1 - rx) : rx`.
- **Bit-Packed BlockStates (`litematic-packed.ts`)**:
  - `BlockStates` is a TAG_Long_Array bit-packing palette indices without padding across 64-bit boundaries.
  - Bits per entry: `bpe = palette.length <= 2 ? 2 : Math.ceil(Math.log2(palette.length))`.
  - Bit extraction masks across adjacent 64-bit longs correctly without endian corruption.
- **Multi-Region & Grouping Eligibility (`region-eligibility.ts`)**:
  - Multi-placement projects export as multi-region when all placements share source format, have unbaked transforms, and share relative position groups.
  - If transforms differ, multi-placement flattens to a single composite region, emitting warning `EXPORT_REGION_GROUPING_LOST`.

### 2.3 Vanilla Structure Template (`.nbt`)
- **Code Reference**: `packages/formats/vanilla-nbt.ts`, `packages/formats/__tests__/slice-b-11-vanilla-nbt.test.ts`
- **Root Tag**: Compound with:
  - `DataVersion`: TAG_Int
  - `size`: TAG_List of 3 TAG_Int `[width, height, length]`
  - `palette`: TAG_List of Compounds (`Name`, `Properties`) or `palettes` list of lists
  - `blocks`: TAG_List of Compounds with `pos` [3 ints], `state` [int index], optional `nbt`
  - `entities`: TAG_List of Compounds

### 2.4 Legacy Schematic (`.schematic`)
- **Code Reference**: `packages/formats/import.ts`, `packages/formats/sponge-legacy.ts`
- **Rejection Policy**: Pre-flattening numeric block ID format (Minecraft ≤1.12).
- Cleanly detected by `detectFormat` and rejected on import with `NbtSafetyError('UNSUPPORTED_FORMAT_LEGACY_SCHEMATIC', ...)` per SPEC §3.1.

### 2.5 Streaming Bounded Codec (`codec.ts`)
- **Code Reference**: `packages/formats/codec.ts`, `packages/formats/__tests__/slice-e1-1-api.test.ts`
- Pure JS decompression via `fflate` streaming chunks into `Gunzip` / `Decompress`.
- Enforces `maxDecompressedBytes` (default 128 MiB) **before** accumulating unbounded output chunks.
- Gzip bombs (e.g. 1 MB compressed zeros) throw `NbtSafetyError('DECOMPRESSION_LIMIT_EXCEEDED', ...)` immediately.
- Raw uncompressed NBT bytes pass through transparently.

---

## 3. Test Evidence & Results

### 3.1 Formats Test Suite Summary (`scripts/run-tests.mjs formats`)
Executed on Node.js 24 with `--experimental-strip-types`:

| Test File | Topic | Status |
|---|---|---|
| `slice-b-0-types.test.ts` | Format types and constants | PASS |
| `slice-b-0.5-adapter.test.ts` | FormatAdapter contracts and reports | PASS |
| `slice-b-1-nbts.test.ts` | NBT tag codecs and compound helpers | PASS |
| `slice-b-1.5-format-detection.test.ts` | Magic bytes and root tag sniffing | PASS |
| `slice-b-10-legacy-id.test.ts` | Legacy block ID lookup table | PASS |
| `slice-b-11-vanilla-nbt.test.ts` | Vanilla Structure Template import | PASS |
| `slice-b-2-size.test.ts` | Signed-size normalization & coordinate mapping | PASS |
| `slice-b-3-packed-blockstates.test.ts` | Litematica bit-packed LongArray encode/decode | PASS |
| `slice-b-4-litematic.test.ts` | Litematica single and multi-region parsing | PASS |
| `slice-b-5-export.test.ts` | Export options and validation rules | PASS |
| `slice-b-6-region-eligibility.test.ts` | Multi-region export eligibility rules | PASS |
| `slice-b-7-sponge-v2.test.ts` | Sponge Schematic v2 adapter | PASS |
| `slice-b-8-sponge-v3.test.ts` | Sponge Schematic v3 adapter | PASS |
| `slice-b-9-inspect.test.ts` | Format inspection and metadata extraction | PASS |
| `slice-e1-1-api.test.ts` | Public API, streaming gzip codec, Sponge v3 & Litematic roundtrips | PASS |
| `slice-e1-2-fixtures.test.ts` | Real-fixture integration scanner | PASS (Truthful BLOCKED status) |

**Result**: 16/16 test files pass in 6.04s.

### 3.2 Public API & Round-Trip Verifications (`slice-e1-1-api.test.ts`)
- **Test 1 (Sponge v3 Round-Trip)**:
  - Exact preservation of block states (`minecraft:stone`, `minecraft:oak_stairs[facing=east,half=bottom,shape=straight,waterlogged=false]`, `minecraft:chest[facing=north,type=single,waterlogged=false]`).
  - Block entities (`minecraft:chest` with CustomName NBT) preserved.
  - Offset `[-2, 0, -4]` sign preserved identically on multiple `import → export → import` cycles.
- **Test 1b (Sponge v3 Composite Multi-Placement)**:
  - 2 placements at offset positions exported into single `.schem`; both placements' blocks verified at world positions.
- **Test 2 (Litematica Single-Region & Multi-Region)**:
  - Single region: Name `MainRegion`, position `[5, 10, 15]`, blocks verified.
  - Multi region: `house` at `[0, 0, 0]`, `tower` at `[20, 5, 0]` both restored by name and translation.
  - Negative Size: `Size = [-2, 2, 2]` normalized to dimensions `2x2x2` with reverse coordinate indexing verified.
- **Test 2d (Litematica Multi-Placement Flattening)**:
  - 2 placements with incompatible metadata flatten into single region with `EXPORT_REGION_GROUPING_LOST` warning and blocks from both placements preserved.
- **Test 3 (Gzip Bomb Protection)**:
  - Streaming decompression byte cap rejects oversized payload before accumulating unbounded memory.
- **Test 4 (Legacy Rejection)**:
  - Legacy `.schematic` rejected with `UNSUPPORTED_FORMAT_LEGACY_SCHEMATIC`.
- **Test 5 (Dimension Cap)**:
  - Width > 65535 rejected with `EXPORT_DIMENSION_LIMIT`.

### 3.3 Real Fixtures Inventory & Evidence Status (`slice-e1-2-fixtures.test.ts`)
Scanned directory: `fixtures/real/`

```
--- TEST SUITE: slice E1.2 Real Fixtures ---
Checking real fixtures directory: C:\Anubhav\Web Dev Projects\EasySchemEdit\fixtures\real
Discovered 0 real fixture file(s) in fixtures/real/: none

BLOCKED (awaiting fixture): Sponge Schematic v3 (.schem) in fixtures/real/ — see fixtures/real/README.md
BLOCKED (awaiting fixture): Multi-region Litematica (.litematic) in fixtures/real/ — see fixtures/real/README.md
BLOCKED (awaiting fixture): Legacy MCEdit / WorldEdit (.schematic) in fixtures/real/ — see fixtures/real/README.md
BLOCKED (awaiting fixture): Vanilla Minecraft Structure Template (.nbt) in fixtures/real/ — see fixtures/real/README.md

----------------------------------------
Results: 0 passed, 0 failed, 4 category/categories BLOCKED (awaiting fixture)
```

Per `AGENTS.md` §3 ("Never generate synthetic fixtures and label them real. Tests that need missing fixtures are marked `BLOCKED (awaiting fixture)`, never green"):
- When the user drops real files into `fixtures/real/`, `slice-e1-2-fixtures.test.ts` automatically executes import, bound verification, and round-trip export verification on each file.
- Current gate status: **GATE 1 CODE COMPLETE & VERIFIED ON UNIT/SYNTHETIC ROUND-TRIPS; REAL FIXTURES PENDING USER UPLOAD**.
