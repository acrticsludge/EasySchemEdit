# SUBSPEC-B — File Formats (v1 implementation contract)

Source decisions: B1–B7 (locked planning baseline).  
Every decision below is translated into implementation details: type definitions, data flow, validation rules, worker responsibilities, frontend interactions, backend/companion responsibilities, failure handling, and tests.

---

## 1. Locked decisions

| ID | Decision | Status |
|---|---|---|
| B1 | Asset distribution: runtime download from official Mojang sources (version-pinned 1.21.11 default). | Locked |
| B2 | Sponge v2 = best-effort import only, no lossless guarantee, import warning shown. | Locked |
| B3 | Reference fixtures: Minecraft 1.20.1, 1.21.1, 1.21.11; real Litematica files, not synthetic. | Locked |
| B4 | Trim outer air **mandatory** on export; fail if any dimension still exceeds 65,535; no auto-split; no silent trim of occupied blocks. | Locked |
| B5 | Preserve multi-region grouping only when relative transforms remain intact; otherwise flatten to single region + warn. | Locked |
| B6 | External validation: WorldEdit (import into pinned test server) + Litematica (open in pinned client with MaLiLib). | Locked |
| B7 | Central diagnostic code registry; stable codes with severity, message, details, remediation. | Locked |

---

## 2. Type definitions

All format-related types live in `packages/formats/types.ts`. `formats` may depend on `domain`, never on renderer or UI packages.

### 2.1 Format detection

```ts
export type FormatSignature = {
  magic: Uint8Array;      // first N bytes used for detection
  mask?: Uint8Array;      // bitmask applied before comparison
  offset: number;         // byte offset where magic starts
};

export type DetectedFormat =
  | { kind: 'schem-v3'; confidence: 'high' | 'low' }
  | { kind: 'schem-v2'; confidence: 'high' | 'low' }
  | { kind: 'litematic'; confidence: 'high' | 'low' }
  | { kind: 'schematic-legacy'; confidence: 'high' | 'low' }
  | { kind: 'unknown'; reason: string };

export type FormatDetectionResult = {
  format: DetectedFormat;
  filenameExtension: string;   // for cross-check, never trusted alone
  extensionMatches: boolean;   // true if extension agrees with signature
  decompressionRequired: boolean; // true if gzip/zlib wrapper detected before NBT
};
```

Detection algorithm (mandatory order):
1. Read the first 2 bytes. If they match gzip magic `1f 8b`, mark `decompressionRequired = true` and decompress with a bounded decompressor (see section 6.5).
2. After decompression (or on raw bytes if not compressed), inspect the NBT structure:
   - Root compound with `Width`, `Height`, `Length`, `Palette`, `BlockStates`, `Offset` → `.schem` v3.
   - Root compound with `Version`, `Regions` → `.litematic`.
   - Root compound with `Materials`, `Blocks`, `Data` → legacy `.schematic` (convert-on-import).
   - Root compound with `size`, `palette`, `blocks`, `DataVersion` → vanilla `.nbt` structure file (convert-on-import).
   - Otherwise → `unknown`.
3. Compare `filenameExtension` to detected format. If they disagree, emit diagnostic `FORMAT_EXTENSION_MISMATCH` (severity `warning`) but **still import using the detected format**. Misleading extensions are never a rejection reason in v1.

### 2.2 Import report

```ts
export type ImportReport = {
  format: DetectedFormat;
  minecraftDataVersion?: number;
  litematicRootVersion?: { major: number; minor: number; revision: number }; // Litematic Version/SubVersion, separate from DataVersion
  dimensions: { width: number; height: number; length: number };
  volume: bigint;                  // BigInt-safe: width * height * length
  nonAirBlockCount: number;
  paletteSize: number;
  regionCount: number;
  fileSizeBytes: number;
  compressedSizeBytes: number;
  decompressedSizeBytes: number;
  preserved: {
    blockEntities: number;
    entities: number;
    biomes: boolean;
    ticks: number;
  };
  unsupported: {
    tags: Diagnostic[];              // unknown/unsupported NBT tags
    blockStates: Diagnostic[];       // block states with no registry handler
  };
  sameStateOverlaps: number;         // positions with >= 2 owners, all same state
  stateConflicts: number;            // positions with >= 2 owners, differing states
  normalized: Diagnostic[];          // data that was normalized (not dropped)
  dropped: Diagnostic[];             // data that could not be retained
  warnings: Diagnostic[];
  errors: Diagnostic[];
};
```

Every import must produce exactly one `ImportReport`. Unknown data is never silently discarded: either preserved opaquely (`unknownTags`) or reported in `dropped`/`unsupported` with a stable code.

### 2.3 Export report

```ts
export type ExportReport = {
  format: 'schem-v3' | 'litematic';
  target: 'composite' | 'placement' | 'selection' | 'import-group';
  minecraftDataVersion?: number;
  dimensions: { width: number; height: number; length: number };
  nonAirBlockCount: number;
  paletteSizeEstimate: number;
  regionCount: number;
  estimatedOutputSizeBytes: number;
  conflictsResolvedByPrecedence: number;   // red + yellow overlaps resolved
  ancillaryData: {
    blockEntities: number;
    entities: number;
    biomes: boolean;
  };
  warnings: Diagnostic[];
  errors: Diagnostic[];
  validation: ExportValidationResult;      // re-import comparison result
};
```

### 2.4 Diagnostic codes (B7)

Central registry in `packages/formats/diagnostic-codes.ts`. Every diagnostic has:
- `code`: stable string (never per-adapter arbitrary codes)
- `severity`: 'error' | 'warning' | 'info'
- `message`: human-readable
- `details`: structured data (block IDs, positions, counts)
- `remediation`: suggested user action

Registry namespaces:

|| Namespace | Codes |
||---|---|
|| `FORMAT_DETECTION` | `FORMAT_EXTENSION_MISMATCH`, `FORMAT_UNKNOWN_SIGNATURE`, `FORMAT_AMBIGUOUS_STRUCTURE` |
|| `IMPORT_NBT_INVALID` | Malformed NBT, truncated buffer, bad VarInt, invalid palette index |
|| `IMPORT_UNSUPPORTED_FORMAT` | Unknown signature, genuinely unsupported format |
|| `IMPORT_UNKNOWN_BLOCK` | Block ID not in registry, preserved as-is |
|| `IMPORT_REGION_INVALID` | Negative size not normalizable, zero-volume region |
|| `IMPORT_TRUNCATED_DATA` | File ends mid-NBT, gzip bomb detected |
|| `EXPORT_DIMENSION_LIMIT` | Axis > 65,535 after air trim and auto-split |
|| `EXPORT_UNSUPPORTED_BLOCK_ENTITY` | Block entity with no transform handler |
|| `EXPORT_INVALID_ORIGIN` | Origin not representable in target format |
|| `EXPORT_REGION_GROUPING_LOST` | Multi-region grouping cannot be preserved; flattened to single region |
|| `ASSET_DOWNLOAD_FAILED` | Browser download of client JAR failed (CORS/network); manual JAR import required |
|| `ASSET_CORRUPT_JAR` | Provided JAR failed zip validation, checksum verification, or size limits |
|| `ASSET_WRONG_VERSION` | Provided JAR is not Minecraft 1.21.11 client JAR |
|| `ASSET_DOWNLOAD_CANCELLED` | Download cancelled by user; partial cache not retained |
|| `ASSET_CACHE_CORRUPT` | Cached asset data failed integrity check on read; re-download required |
|| `ASSET_MISSING_TEXTURE` | Texture not found in pack |
|| `ASSET_MISSING_MODEL` | Block model not found in pack |
|| `ASSET_WRONG_VERSION` | Pack format ≠ 75.0 (1.21.11) |
|| `ENGINE_OFF_GRID_TRANSFORM` | Fractional or off-grid transform rejected |
|| `ENGINE_OPERATION_TOO_LARGE` | Cell count exceeds budget |
|| `ENGINE_STORAGE_LIMIT` | IndexedDB quota exceeded |
|| `NBT_SAFETY` | `NBT_TAG_COUNT_EXCEEDED`, `NBT_STRING_TOO_LONG`, `NBT_ARRAY_TOO_LONG`, `NBT_DECOMPRESSION_RATIO_EXCEEDED`, `NBT_PARSE_DURATION_EXCEEDED`, `NBT_DUPLICATE_REQUIRED_FIELD`, `NBT_INTEGER_OVERFLOW` |

Note: `FORMAT_EXTENSION_MISMATCH` is a **warning only**. The file is still imported using the detected format. `IMPORT_UNSUPPORTED_FORMAT` is reserved for genuinely unsupported formats (legacy `.schematic`, unknown signature).

Example diagnostic shape:

```ts
{
  code: 'EXPORT_DIMENSION_LIMIT',
  severity: 'error',
  message: 'Exported schematic width 70000 exceeds Sponge v3 limit of 65535 on X axis.',
  details: { axis: 'x', dimension: 70000, limit: 65535, afterAirTrim: true },
  remediation: 'Reduce selection size or split export manually; automatic splitting is not supported in v1.',
}
```

---

## 3. Format adapters architecture

`packages/formats` owns:
- NBT parsing/writing, gzip, bounded decompression, format detection.
- Sponge v2/v3 adapters.
- Litematica adapter (multi-region, signed-size normalization).
- Block-state palette encode/decode.
- Block-entity/entity/biome/tick metadata adapters.
- Import/export reports and compatibility diagnostics.

Format code must not import Three.js, React, DOM APIs, or UI state. Adapters consume/produce domain records (`BlockStateId`, `ChunkedVoxelVolume`, `Placement`, `NbtTag`) and byte streams.

### 3.1 Adapter interface

```ts
export interface FormatAdapter {
  readonly formatId: 'schem-v2' | 'schem-v3' | 'litematic';
  detect(bytes: Uint8Array): FormatDetectionResult;
  import(bytes: Uint8Array, options: ImportOptions): Promise<ImportResult>;
  export(snapshot: ProjectSnapshot, target: ExportTarget, options: ExportOptions): Promise<ExportResult>;
}

export type ImportResult = {
  placements: Placement[];
  importGroups: ImportGroup[];
  report: ImportReport;
  normalizedImport: boolean;   // true when source format is v2 or otherwise normalized
};

export type ExportResult = {
  bytes: Uint8Array;          // serialized format bytes
  filename: string;
  report: ExportReport;
};

export type ImportOptions = {
  preserveSourceOrigin: boolean;   // vs normalize to [0,0,0]
  autoArrange: boolean;            // place to right of scene bounds
  strict: boolean;                 // refuse on fidelity loss
  maxCompressedBytes: number;
  maxDecompressedBytes: number;
  maxTotalVolume: bigint;
  maxNonAirBlocks: number;
  maxNbtNestingDepth: number;
  maxNbtTagCount: number;
};

export type ExportTarget =
  | { kind: 'placement'; placementId: string }
  | { kind: 'importGroup'; importGroupId: string }
  | { kind: 'composite'; selection?: Bounds3i; includeHidden: boolean }
  | { kind: 'selection'; bounds: Bounds3i; includeHidden: boolean };

export type ExportOptions = {
  strict: boolean;                 // refuse on fidelity loss (default true)
  confirmLossy: boolean;           // user acknowledged losses
  includeRegionMetadata: boolean;  // litematic multi-region only
  trimOuterAir: boolean;           // defaults to true; if false, outer air is preserved and Offset/origin metadata adjusted
  bakeTransforms: boolean;         // if true, bake placement transforms into output blocks
};

export type ProjectSnapshot = {
  schemaVersion: number;
  id: string;
  name: string;
  placements: ReadonlyArray<{
    id: string;
    name: string;
    transform: Transform;
    origin: Vec3Half;
    visible: boolean;
    locked: boolean;
    source: PlacementSource;
    volumeRef: { bounds: Bounds3i; chunkKeys: string[]; nonAirCount: number };
  }>;
  importGroups: ReadonlyArray<ImportGroup>;
  overlapPolicy: 'top-wins' | 'bottom-wins';
  revision: number;
  chunkViews: Map<string, { indices: Uint8Array | Uint16Array | Uint32Array; palette: BlockStateId[] }>;
};
```

---

## 4. Sponge schem v3

### 4.1 Read contract

- Parse official Sponge Schematic v3 NBT structure (gzip-compressed NBT).
- Read `Width`, `Height`, `Length` (unsigned 16-bit).
- Read VarInt-encoded block palette data with index order `x + z * Width + y * Width * Length`.
- Preserve `DataVersion`, metadata, `Offset`, block entities, entities, biome palette/data when present.
- `Offset` is a paste offset from paste target to first block; not a generic world transform matrix.
- With canonical local bounds starting at zero and origin defined as a grid point, write `Offset = -origin` for untransformed placement export.

### 4.2 Origin handling (resolves SUBSPEC-A/SUBSPEC-B conflict)

Sponge v3 `Offset` is an **integer** `[x, y, z]` triple. The domain `Placement.origin` is `Vec3Half` (integer or half-integer).

Export rule (exact, no rounding, no position change):

```
Given placement P with origin O (Vec3Half) and translation T (Vec3i):
  Export local volume with bounds.min = [0,0,0].
  The block at local coordinate [0,0,0] occupies world cell [tx, ty, tz] where
    [tx, ty, tz] = localBlockToWorld(P, [0,0,0])   // via SUBSPEC-A 3.2
  Sponge Offset = [-tx, -ty, -tz]   // integer triple, exact
```

Because `translation` is integer and `localBlockToWorld` maps block centers to integer world cells (SUBSPEC-A 3.2), `tx`, `ty`, `tz` are always integers. `Offset = -origin_world` is exact integer arithmetic; no rounding occurs. Block positions are unchanged.

If `O` is half-integer, `localBlockToWorld(P, [0,0,0])` still yields an integer world cell because the transform math guarantees half-integer world centers whose floor is integer. The export writes the block cell positions, not the origin coordinate directly, so no information is lost.

Litematica origin metadata: Litematica stores per-region `Position` (signed integer triple) and per-block metadata. On import, region `Position` is preserved in `source.rawMetadata` and used to compute relative placement offsets within an Import Group. On export, if grouping is preserved (section 5.5), region `Position` values are written from the source metadata; otherwise the composite origin is used and a warning is emitted.

### 4.3 Write contract

- Gzip compression is required by the v3 format contract.
- Trim outer air by default (`trimOuterAir` configurable, defaults `true`); auto-split oversized axes; no silent trim of occupied blocks.
- Individual dimension > 65,535 after air trim → `EXPORT_DIMENSION_LIMIT`, refuse export (B4).
- Trim outer air while adjusting `Offset` so world-space positions remain unchanged (B4).
- If any remaining dimension exceeds 65,535 after trim, refuse; show which axis; offer manual split (B4).
- One region only (schem v3 is single-region).
- Preserve supported block entities, entities, biomes, metadata.
- Unknown NBT retained verbatim in `unknownTags` or reported.
- Diagnostics for unsupported entities, biomes, and ticks (section 8).

### 4.3 Sponge v2 (B2)

- Best-effort import only; normalize into canonical domain model.
- No lossless guarantee; no byte-level round-trip claim.
- Import warning displayed; result marked `normalizedImport: true`.
- Export: not supported in v1; show clear message.

### 4.4 Legacy `.schematic`

- **Import:** supported via convert-on-import. Legacy `.schematic` files are read, normalized into the canonical domain model, and imported as a single placement. Import warning displayed; result marked `normalizedImport: true`.
- No byte-level round-trip guarantee; no lossless claim. Block positions and states are preserved where mappable to the 1.21.11 registry; unmappable states are reported in `unsupported.blockStates`.
- Export: not supported in v1; show clear message.
- Code: `IMPORT_UNSUPPORTED_FORMAT` is reserved for genuinely unknown signatures, not for legacy `.schematic` (which is now a supported convert-on-import format).

### 4.5 Vanilla `.nbt` structure files

- **Import:** supported via convert-on-import. Vanilla `.nbt` structure files (generated by in-game structure blocks) are read, normalized into the canonical domain model, and imported as a single placement. Import warning displayed; result marked `normalizedImport: true`.
- Structure block NBT is parsed for `size` (int array `[x, y, z]`), `palette` (list of block state names), `blocks` (list of `{ pos: [x, y, z], state: int }` entries referencing palette indices), and `entities` (list of entity NBT compounds). Block positions are resolved relative to the structure's origin offset; block states are mapped to the 1.21.11 registry where possible.
- No byte-level round-trip guarantee; no lossless claim. Unmappable states are reported in `unsupported.blockStates`.
- Export: not supported in v1; show clear message.

---

## 5. Litematica `.litematic`

### 5.1 Read contract

- Parse root NBT document and every named entry in `Regions`.
- Preserve root metadata and per-region metadata/tags where supported.
- Each region: own `Position`, signed `Size`, palette, packed `BlockStates`, optional block entities/entities/pending ticks.
- Negative region dimensions are valid; normalize through explicit signed-axis mapping, never treat as malformed positive dimensions (B3).
- File-level enclosure and origin retained separately from each region's local coordinate frame.
- Multi-region file imports as an **Import Group** with one editable placement per region; relative region positions preserved.

### 5.2 Packed BlockStates decoding and encoding (exact algorithm)

Litematica stores block states as a packed array. The exact algorithm:

```
Inputs:
  palette: BlockStateId[]          // length P, index 0 = air equivalent
  packed: Long[]                   // array of 64-bit signed longs
  bitsPerEntry: integer            // derived from palette size P
  regionWidth, regionHeight, regionLength: integer (may be negative)

Step 1: Determine bits per entry (minimum palette width).
  If P <= 1: bitsPerEntry = 0 (all air; no bits needed, no packed data)
  Else: bitsPerEntry = ceil(log2(P))   // minimum bits to represent indices 0..P-1
  // Test widths: P=1→0, P=5→3, P=12→4, P=20→5, P=300→9.
  // Do NOT round up to 4/8/12/16/32 buckets.

Step 2: Total entries.
  totalEntries = |regionWidth| * |regionHeight| * |regionLength|
  (computed with BigInt to avoid overflow)

Step 3: Exact packed-array length.
  If bitsPerEntry == 0: wordsNeeded = 0
  Else:
    totalBits = totalEntries * bitsPerEntry   (BigInt)
    wordsNeeded = ceil(totalBits / 64)        // number of 64-bit longs

  If packed.length < wordsNeeded: IMPORT_TRUNCATED_DATA
  Extra longs beyond wordsNeeded are ignored (tolerant read).

Step 4: Decode entry at linear index i (0 <= i < totalEntries).
  // Continuous LSB-first bitstream; entry i occupies bit range
  // [i*BPE, i*BPE+BPE) and MAY cross a 64-bit word boundary.
  bitStart = i * bitsPerEntry   (BigInt)
  wordStart = floor(bitStart / 64)
  bitOff = bitStart % 64        // 0..63
  MASK(b) = (1n << BigInt(b)) - 1n   // b-bit mask, BigInt

  If bitOff + bitsPerEntry <= 64:
    // Entire entry inside one word.
    entry = (packed[wordStart] >> bitOff) & MASK(bitsPerEntry)
  Else:
    // Entry crosses the 64-bit boundary into the next word.
    lowBits = 64 - bitOff          // bits available in wordStart
    highBits = bitsPerEntry - lowBits   // remaining bits spill into wordStart+1
    lowPart = (packed[wordStart] >> bitOff) & MASK(lowBits)
    highPart = packed[wordStart + 1] & MASK(highBits)
    entry = lowPart | (highPart << BigInt(lowBits))

  // packed: BigInt[] of unsigned 64-bit values (NBT longs read as unsigned).
  // Shifts are BigInt shifts on unsigned 64-bit values; no sign extension.
  // A negative NBT long becomes its unsigned bit pattern (value + 2^64).

Step 5: Palette lookup.
  blockStateId = palette[entry]
  If entry >= palette.length: IMPORT_NBT_INVALID (invalid palette index)

Step 6: Cross-word boundary rule.
  Because packing is continuous, bitOff + bitsPerEntry may exceed 64; the entry's
  high bits are taken from the next word. There is no padding or alignment between
  entries. The last entry in a word shares the word with the first entry of the next.

Palette validation:
- Palette length P must satisfy P <= 2^bitsPerEntry (always true by Step 1; validated on import).
- Palette index 0 must be the air state for the format (or the format's air equivalent).
- Duplicate palette entries are rejected with IMPORT_NBT_INVALID.

Encoding (reverse of decode):
  wordsNeeded = ceil(totalEntries * bitsPerEntry / 64)   // 0 if bitsPerEntry == 0
  allocate packed = [0n, ...] (wordsNeeded unsigned 64-bit BigInts)
  for each linear index i in [0, totalEntries):
    entry = palette index of the block state at i
    bitStart = i * bitsPerEntry
    wordStart = floor(bitStart / 64)
    bitOff = bitStart % 64
    If bitOff + bitsPerEntry <= 64:
      packed[wordStart] |= (entry & MASK(bitsPerEntry)) << bitOff
    Else:
      lowBits = 64 - bitOff
      highBits = bitsPerEntry - lowBits
      packed[wordStart] |= (entry & MASK(lowBits)) << bitOff
      packed[wordStart + 1] |= (entry >> BigInt(lowBits)) & MASK(highBits)
    Mask each word to 64 bits: packed[w] &= ((1n << 64n) - 1n)
  Write packed as signed 64-bit longs (two's complement)

Worked boundary crossing (P = 5, BPE = 3): entry i = 21 → bitStart = 63, bitOff = 63,
bitOff + BPE = 66 > 64 → crosses. lowBits = 1, highBits = 2.
entry = bit 63 of word0 | ((bits 0-1 of word1) << 1). Entry 22 starts at bit 66
(word 1, bit 2). No gaps, no alignment padding.
```

### 5.3 Negative Size normalization (complete)

Litematica regions may have negative `Size` components. Normalization:

```
Given region R with Position P = [px, py, pz] and Size S = [sx, sy, sz] (signed):

Step 1: Compute absolute dimensions.
  ax = |sx|, ay = |sy|, az = |sz|
  If ax == 0 or ay == 0 or az == 0: IMPORT_REGION_INVALID (zero-volume region)

Step 2: Compute normalized min corner (signed-axis mapping).
  For each axis a in {x, y, z}:
    if S[a] >= 0: min[a] = P[a]
    if S[a] < 0:  min[a] = P[a] + S[a] + 1   // e.g. P=5, S=-3 → min = 3

Step 3: Normalized bounds.
  bounds.min = [min.x, min.y, min.z]
  bounds.maxExclusive = [min.x + ax, min.y + ay, min.z + az]

Step 4: Packed storage index → normalized local coordinate.
  The packed array is indexed in the order defined by Litematica:
    linearIndex = x' + z' * ax + y' * ax * az
  where x', y', z' are coordinates in the **raw** (possibly negative-axis) storage frame.

  Mapping from raw to normalized (0-based, within [0, ax) × [0, ay) × [0, az)):
    For each axis a:
      if S[a] >= 0: coord[a] = raw[a]
      if S[a] < 0:  coord[a] = ax - 1 - raw[a]   // index reversal

  The normalized local block is `coord` itself — **already 0-based in the placement's
  normalized volume**. Do NOT subtract `bounds.min` from `coord`: `bounds.min` is a
  world-space position, and `coord` is already a local index. Subtracting it mixes
  frames and corrupts local coordinates. The world-space position of this block is
  `bounds.min + coord`, tracked separately as the placement's translation (Step 6).

Step 5: Block entity, entity, and tick transformations.
  Block entity position (raw local): apply the same axis reversal as above → `coord`;
  that is the normalized local position (do not subtract bounds.min).
  Entity position (raw fractional): apply the same axis reversal to each component;
  the result is the normalized local fractional position (world = bounds.min + coord).
  Tick position (raw local): same as block entity → `coord` (do not subtract bounds.min).

  Normalized local indices and original region world positions are kept separate:
  `coord` is always a local index in [0, dimension), while `bounds.min` (the world-space
  min corner) is the original region world position used only to place the region in the
  world (placement translation).

Step 6: Relative position within Import Group.
  Each region's placement `transform.translation` = `bounds.min` (the world position of
  its normalized min corner), so relative region positions are preserved as world offsets.
  The placement's local volume stays normalized (`volume.bounds.min = [0,0,0]`,
  `volume.bounds.maxExclusive = [ax, ay, az]`), with local indices `coord` in [0, axis
  dimension). Local indices are never mixed with world positions.

### 5.5 Multi-region export eligibility (deterministic checker)

```ts
export type RegionGroupMetadata = {
  importGroupId: string;
  sourceFilename: string;
  regionNames: string[];           // original region names in order
  regionPositions: Vec3i[];        // original region Position values
  commonGroupTransform?: Transform; // if all regions share one transform
  baked: boolean;                  // true if any bake flattened this group
};

export function checkMultiRegionExportEligibility(
  snapshot: ProjectSnapshot,
  importGroupId: string
): { eligible: boolean; reason?: string; regions: RegionGroupMetadata[] } {
  const group = snapshot.importGroups.find(g => g.id === importGroupId);
  if (!group) return { eligible: false, reason: 'importGroupNotFound', regions: [] };

  const placements = group.placementIds.map(id => snapshot.placements.find(p => p.id === id)!);

  // Rule 1: All placements must belong to this import group.
  // Rule 2: No placement may have been baked (flattened).
  for (const p of placements) {
    if (p.source.baked) return { eligible: false, reason: 'placementBaked', regions: [] };
  }

  // Rule 3: Relative positions must remain intact.
  // Compare current placement translations against original relative offsets.
  const originalOffsets = group.regionPositions;
  const currentTranslations = placements.map(p => p.transform.translation);
  const base = currentTranslations[0];
  for (let i = 0; i < placements.length; i++) {
    const expected = [
      base[0] + (originalOffsets[i][0] - originalOffsets[0][0]),
      base[1] + (originalOffsets[i][1] - originalOffsets[0][1]),
      base[2] + (originalOffsets[i][2] - originalOffsets[0][2]),
    ];
    if (!vec3iEquals(currentTranslations[i], expected)) {
      return { eligible: false, reason: 'relativePositionsChanged', regions: [] };
    }
  }

  // Rule 4: Common group transform check.
  // If all placements share the same rotationY and mirror, grouping can be preserved
  // with a shared group transform. If any placement has an independent rotation/mirror,
  // grouping cannot be preserved unless the adapter has proven the conversion correct.
  const transforms = placements.map(p => ({ rotationY: p.transform.rotationY, mirror: p.transform.mirror }));
  const first = transforms[0];
  const allSame = transforms.every(t => t.rotationY === first.rotationY && t.mirror === first.mirror);

  if (!allSame) {
    return { eligible: false, reason: 'independentTransforms', regions: [] };
  }

  // Rule 5: All placements must have compatible source format (litematic).
  if (group.sourceFormat !== 'litematic') return { eligible: false, reason: 'unsupportedSourceFormat', regions: [] };

  return {
    eligible: true,
    regions: placements.map((p, i) => ({
      importGroupId: group.id,
      sourceFilename: group.sourceFilename,
      regionNames: [p.source.regionName ?? `region-${i}`],
      regionPositions: [group.regionPositions[i]],
      commonGroupTransform: allSame ? { ...p.transform } : undefined,
      baked: false,
    })),
  };
}
```

Export behavior:
- If `eligible`: export as multi-region `.litematic` with original region names, positions, and shared group transform.
- If not eligible: export as single-region `.litematic` (flattened composite) + warning `EXPORT_REGION_GROUPING_LOST` listing which placements were merged and why.

---

## 6. Fidelity levels

| Level | Meaning | v1 contract |
|---|---|---|
| F0 — block-state fidelity | Every supported block position resolves to same namespaced ID and properties after import/export. | Required for supported formats and valid files. |
| F1 — ancillary-data fidelity | Block entities, entities, biomes, metadata, supported tick data retained and re-serialized. | Required for data types in format support matrix. |
| F2 — transform fidelity | Ancillary data and block-state orientation remain semantically valid after move/rotate/mirror/copy/bake. | Required for explicitly supported handlers; otherwise warn + require confirmation before lossy export. |
| F3 — byte identity | Output compressed NBT bytes identical to input. | Not promised. Compression, tag ordering, normalized palette ordering may differ. |

---

## 7. Import/export report requirements

Every import and export produces a structured report with:
- Detected format and version.
- Minecraft data version, where present.
- Dimensions, volume, non-air block count, palette size, region count, file size.
- Imported/preserved counts for block entities, entities, biomes, ticks.
- Unknown or unsupported tags and block states.
- Data normalized, dropped, or not safely transformed.
- Warnings and errors with stable codes (B7), not only human-readable strings.

A warning must identify affected data and the operation causing risk. "Some data may be lost" by itself is insufficient.

---

## 8. Strict and permissive modes + air trimming

- **Strict export (default):** refuse to export if a known fidelity-breaking condition exists, unless user explicitly acknowledges the listed loss via `confirmLossy`.
- **Permissive export:** allow export but include visible report of exactly which data was not preserved.
- Import must never silently discard unknown data. Preserve opaque NBT when safe, or report why it cannot be retained.
- **Outer-air trimming is configurable in v1.** `ExportOptions.trimOuterAir` defaults to `true`; when `false`, outer air is preserved and `Offset`/origin metadata is adjusted so world-space positions remain unchanged. Setting `trimOuterAir: false` is not an error.
- **Oversized axis auto-split:** if any remaining dimension exceeds 65,535 after air trim, the exporter attempts automatic spatial splitting along that axis into multiple regions (for multi-region formats) or multiple files, each under the limit. If splitting cannot preserve fidelity, the export is refused with `EXPORT_DIMENSION_LIMIT` showing which axis and the split result.
- **Lossy export confirmation:** when a lossy condition exists, the UI requires an explicit `confirmLossy` acknowledgement before proceeding in strict mode; in permissive mode the export proceeds with a visible report. The confirmation names the exact data that will be lost, not a generic message.
- Diagnostics for unsupported entities, biomes, and ticks are emitted in `unsupportedInExport`:
  - Entities with no Litematic/Sponge handler → diagnostic with entity type and count.
  - Biomes not supported by target format → diagnostic with biome IDs and count.
  - Pending ticks without registered transform handler → diagnostic with block state and tick count.

---

## 9. Asset extraction pipeline (B1)

Default asset profile: Minecraft Java 1.21.11, resource-pack format 75.0.

### 9.1 First-run asset load flow

On first launch (no cached assets for the pinned profile), the editor shows a **Load Minecraft assets** panel instead of blocking the user. Schematics still import and edit; blocks render with the missing-model placeholder until assets load.

**Panel contents (re-openable from the Assets bottom-dock tab):**
- **Auto-download button**: resolve official Mojang version manifest → client JAR → worker extraction → IndexedDB cache (same pipeline as below).
- **Drag-drop / file-picker zone**: accept a user-supplied `1.21.11.jar`.
- **How-to** (no third-party asset site links):
  1. Official route: version manifest → version JSON → `downloads.client.url` → client JAR.
  2. Local route: `.minecraft/versions/1.21.11/1.21.11.jar`.
- **Auto-download failure**: on CORS/network failure, the panel automatically surfaces the manual JAR zone with a clear message (`ASSET_DOWNLOAD_FAILED`). Never a dead end — the user can always fall back to manual JAR import.

### 9.2 Pipeline (identical for auto-download and manual JAR import)

```text
1. Resolve pinned Minecraft version manifest (official Mojang launchmeta).
   - Auto-download: fetch manifest from Mojang, parse version JSON for `downloads.client.url`.
   - Manual JAR: skip manifest; accept user-provided JAR file directly.
2. Download client JAR (auto-download) or accept user-provided JAR file (manual).
   - Show progress bar, percentage, estimated time, cancel button.
   - Enforce size/zip-safety limits before extraction (see 9.4).
4. In a worker:
   a. Open JAR as zip (validate zip paths, file count, decompressed size).
   b. Accept only a client JAR for the base profile. Resource-pack zips are override-only;
      if no base assets exist, warn that overrides have nothing to fall back on.
   c. Extract `assets/minecraft/blockstates/*.json`, `assets/minecraft/models/*.json`,
      `assets/minecraft/textures/*.png`.
   d. Verify client JAR integrity:
      - Auto-download: verify SHA-1 of downloaded JAR against `downloads.client.sha1` from the version JSON.
      - Manual JAR: verify SHA-1 against the pinned expected SHA-1 for 1.21.11 bundled in the app.
      - Detect `ASSET_WRONG_VERSION` by reading `version.json` at the JAR root and comparing its embedded `version` field against `1.21.11`.
   e. On any integrity failure: `ASSET_CORRUPT_JAR` or `ASSET_WRONG_VERSION`;
      partial cache is not retained.
5. Cache extracted assets in IndexedDB keyed by version + asset hash.
   - Cache once, then fully offline.
   - On read, verify cache integrity; on failure: `ASSET_CACHE_CORRUPT`, re-download required.
6. Resource packs override vanilla base pack; priority order explicit and visible.
7. Missing blocks/models/textures → missing-model fallback + diagnostic.
```

### 9.3 UI state and persistence

- Asset load status shown in Assets tab and status bar: version, source (auto-downloaded / manual JAR / none), cached size, last verified. Derived from the cache, not a user preference.
- Until assets load: persistent warning banner with a **"Load assets"** action re-opening the panel.
- Failures never corrupt the cache: cancelled downloads discard partial data; corrupt cache entries are replaced on re-download.

Phase 0 gate: verify actual browser CORS/download feasibility for official Mojang asset endpoints (both auto-download and manual JAR paths end-to-end). If blocked, the manual JAR import path must work end-to-end.

Version selector for loading other resource-pack versions later. Do not label 1.21.11 as "latest Minecraft version"; it is the deliberately pinned default profile.

Resource packs are untrusted input: validate zip paths, file count, decompressed size, JSON depth, image dimensions, and texture limits before use.

---

## 10. Data flow

```
File bytes → format detection (decompress first) → NBT parse (bounded, worker)
    → format adapter (immutable snapshot) → domain records → ImportReport → Placement[]/ImportGroup[]

ProjectSnapshot → ExportTarget selection → format adapter (worker, streaming)
    → serialized bytes → ExportReport → download / workspace file
```

Format adapters never hold live `Project` references. Worker receives serialized snapshots and returns new buffers (SUBSPEC-A section 6).

---

## 11. Immutable snapshots and memory management

Format adapters consume immutable project snapshots, never live mutable project state (SUBSPEC-A section 6).

```
Snapshot creation (main thread):
1. Freeze project metadata (placements array, importGroups, overlapPolicy, revision).
2. For each chunk referenced by the export target, transfer ownership of the `indices` ArrayBuffer view to the worker snapshot.
3. Unreferenced chunks are not included.
4. Snapshot = { projectMetadata, chunkViews: Map<chunkKey, ArrayBufferView> }.

Worker responsibilities:
1. Receives snapshot + typed export message.
2. Reads chunk views (no writes to live project).
3. Produces output bytes as a new ArrayBuffer.
4. Returns result; main thread applies only if `project.revision` still matches `baseRevision`.

Memory rules:
- No multiple giant intermediate buffers: streaming writer emits format bytes incrementally.
- Chunk index arrays are transferred (not copied) where possible; main thread retains its own copy until commit.
- Stale worker results (revision mismatch) discarded; buffers released.
- Cancellation via `AbortController`; partial results never committed.
```

---

## 12. NBT safety (revised)

Limits enforced at parse and encode time:

| Limit | Default | Exceeded → |
|---|---|---|
| Total NBT tags | 1,000,000 | `NBT_TAG_COUNT_EXCEEDED` |
| String length (UTF-8 bytes) | 1 MiB | `NBT_STRING_TOO_LONG` |
| List element count | 1,000,000 | `NBT_TAG_COUNT_EXCEEDED` (counted per element) |
| Byte/int/long array length | 16 MiB elements | `NBT_ARRAY_TOO_LONG` |
| Decompression ratio (compressed → decompressed) | 100:1 | `NBT_DECOMPRESSION_RATIO_EXCEEDED` |
| Parsing duration | 30 seconds | `NBT_PARSE_DURATION_EXCEEDED` |
| NBT nesting depth | 512 | `NBT_NESTING_DEPTH_EXCEEDED` |
| Integer overflow (byte/short/int/long range) | per-type | `NBT_INTEGER_OVERFLOW` |
| Duplicate required fields in compound | any duplicate | `NBT_DUPLICATE_REQUIRED_FIELD` |

Streaming/incremental parsing:
- NBT is parsed in a worker with bounded allocation.
- For files above 1 MiB compressed, parsing streams in chunks; partial structures are not materialized until complete.
- Encoding writes incrementally to a growable buffer; no full-document intermediate string.

Duplicate required fields: if a compound contains the same named tag twice (e.g. two `Width` fields), the parse fails with `NBT_DUPLICATE_REQUIRED_FIELD` rather than silently taking the first or last.

---

## 13. External validation (B6)

Two external authorities:

1. **WorldEdit:** import exported schematics into a pinned test server; validate placement and block counts.
2. **Litematica:** open exported `.litematic` files in a pinned Minecraft client with compatible Litematica + MaLiLib versions.

CI can run headless validation harness on Linux. Manual acceptance on Windows 11 (primary environment).

Re-import exported files with own parser and compare against canonical expected output. For composite output, compare against canonical resolved snapshot.

---

## 14. Failure handling

|| Condition | Handling |
||---|---|
|| Truncated NBT / bad VarInt | `IMPORT_NBT_INVALID`; reject import with position and expected vs actual. |
|| Gzip bomb / decompression bomb | `IMPORT_TRUNCATED_DATA`; reject before allocation; show estimated size. |
|| Misleading filename (extension ≠ signature) | `FORMAT_EXTENSION_MISMATCH` (warning); import proceeds using detected format. |
|| Legacy `.schematic` | `IMPORT_UNSUPPORTED_FORMAT` is not used for this format; it is supported via convert-on-import with `normalizedImport: true`. |
|| Dimension > 65,535 after air trim | `EXPORT_DIMENSION_LIMIT`; refuse; show axis; offer manual split. |
|| Unsupported block entity in export | `EXPORT_UNSUPPORTED_BLOCK_ENTITY`; strict = refuse, permissive = warn + proceed. |
|| Missing texture/model in asset pack | `ASSET_MISSING_TEXTURE` / `ASSET_MISSING_MODEL`; missing-model fallback + diagnostic. |
|| Asset version mismatch (pack ≠ 75.0) | `ASSET_WRONG_VERSION`; warn, show pinned version. |
|| Import exceeds memory budget | `ENGINE_OPERATION_TOO_LARGE`; reject before allocation. |
|| Worker crash during parse | Discard partial result; main thread unchanged; surface error. |
|| NBT safety limit exceeded | Appropriate `NBT_SAFETY` code; reject with structured details. |
|| Duplicate required NBT field | `NBT_DUPLICATE_REQUIRED_FIELD`; reject import. |
|| Invalid palette index in packed data | `IMPORT_NBT_INVALID`; reject import. |

---

## 15. Tests and acceptance criteria

### 15.1 Format tests

Maintain checked-in fixtures produced by real supported tools:

#### Required fixture matrix

| Format | Minecraft version | Single region | Multi-region | Negative size | Negative coords | Small palette | Wide packing | Cross-word | Entities | Block entities | Pending ticks | Malformed | Empty | All-air | Metadata-heavy | Large |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Sponge v3 | 1.20.1 | ✓ | — | — | — | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ | ✓ | ✓ | ✓ |
| Sponge v3 | 1.21.1 | ✓ | — | — | — | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | — | — | ✓ | — |
| Sponge v3 | 1.21.11 | ✓ | — | — | — | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | — | — | ✓ | — |
| Sponge v2 | 1.20.1 | ✓ | — | — | — | — | — | — | — | — | — | ✓ | — | — | — | — |
| Litematic | 1.20.1 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Litematic | 1.21.1 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | ✓ | — |
| Litematic | 1.21.11 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | ✓ | — |
| Legacy `.schematic` | any | ✓ (convert-on-import) | — | — | — | — | — | — | — | — | — | — | ✓ | — | — | — | — |

Fixtures must be real files created by Litematica / WorldEdit / Sponge tools, not synthetic files generated by this editor.

Round-trip checks compare semantic block states and supported ancillary data. Byte equality not required (F3).

### 15.2 External compatibility tests

- Open generated `.schem` in WorldEdit/Sponge-compatible tooling; validate placement and block counts.
- Open generated `.litematic` in Litematica with pinned versions.
- Re-import exported files; compare against canonical expected output.
- Keep known-good fixtures from multiple versions; do not validate only files generated by this editor.

### 15.3 Acceptance criteria for SUBSPEC-B (revised)

1. Format detection decompresses gzip before NBT inspection; misleading extension produces `FORMAT_EXTENSION_MISMATCH` warning but import proceeds using detected format.
2. Litematic packed BlockStates decode/encode documented exactly: bits per entry by palette size, entries per word, cross-word behavior, signed long handling via unsigned shift, palette validation, packed-array length validation.
3. Negative Litematic Size normalized via signed-axis mapping; block entities, entities, and ticks transformed consistently with axis reversal.
4. Sponge v3 `Offset` export is exact integer arithmetic (`Offset = -origin_world`), no rounding, no block position change; half-integer domain origins handled via block cell export.
5. Litematica origin metadata (`Position`) preserved per region on import/export when grouping retained.
6. Multi-region export eligibility checker is deterministic; preserves grouping only when relative transforms intact, shared rotation/mirror, no baking; otherwise single region + `EXPORT_REGION_GROUPING_LOST`.
7. NBT safety limits enforced: tag count, string/array lengths, decompression ratio, parse duration, nesting depth, integer overflow, duplicate required fields.
8. Streaming/incremental NBT parsing and encoding for files above 1 MiB compressed.
9. `ImportReport.volume` is `bigint`; `normalizedImport` field present; `ExportValidationResult` defined; `sameStateOverlaps` and `stateConflicts` counted separately.
10. Outer-air trimming configurable; defaults to `true`, `false` allowed with Offset/origin metadata adjusted; oversized axis auto-split; strict vs permissive export unambiguous.
11. Diagnostics for unsupported entities, biomes, and ticks in export reports.
12. Asset extraction pipeline obtains client JAR from official metadata, extracts blockstates/models/textures in worker, caches in IndexedDB, identical pipeline for manual JAR import.
13. Phase 0 verifies browser CORS/download feasibility for official Mojang asset endpoints; manual JAR fallback works end-to-end.
14. Export semantics: placement bakes transform; import group preserves or flattens per eligibility; composite bakes transforms and applies overlap policy; hidden placements excluded by default, includable via option.
15. Format adapters receive immutable `ProjectSnapshot`; no multiple giant intermediate buffers; streaming writer used for large exports.
16. All source metadata, unknown tags, and supported ancillary data preserved or reported; fixture matrix includes malformed, empty, all-air, large, multi-region, metadata-heavy files.
17. External validation passes: WorldEdit placement/count check, Litematica open check with pinned versions.
18. Format code has zero imports of Three.js, React, DOM, or UI state.
19. All diagnostics use central registry codes (B7 namespaces); no per-adapter arbitrary codes.
20. Sponge v2 imports with warning and `normalizedImport: true`; no export. Legacy `.schematic` imports with warning and `normalizedImport: true`; no export.

---

## 16. Cross-document dependency check vs SUBSPEC-A

| SUBSPEC-A element | SUBSPEC-B usage | Consistent? |
|---|---|---|
| `Vec3Half` origin | Litematica region Position mapped to placement translation; Sponge `Offset = -origin_world` exact integer | Yes |
| `BlockStateId` canonical | Palette entries are `BlockStateId`; equality value-based | Yes |
| `ChunkedVoxelVolume` `CHUNK_SIZE = 16` | Import writes chunks; export reads chunks | Yes |
| `NbtTag` typed AST | All NBT read/write through AST; no `unknown` | Yes |
| `Transform` integer `translation` | Export writes block cells, not origin floats; no rounding | Yes |
| `Project.placements` bottom-to-top order | Overlap policy used for composite export resolution | Yes |
| Immutable snapshot / worker ownership | Export adapters receive `ProjectSnapshot`, never live `Project` | Yes |
| `CANONICAL_AIR` index 0 | Palette index 0 reserved; all-air chunks omitted | Yes |
| Air-like: air, cave_air, void_air non-owning | Conflict resolution filters air-like contributions | Yes |

---

**Next:** SUBSPEC-C (Project & Persistence) will follow once Subspec B is accepted.